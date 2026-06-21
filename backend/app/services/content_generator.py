"""Prompt assembly for content generation, outlines, critiques, and revisions."""
from __future__ import annotations
import json
import re
from typing import Any


def _load_banned_words() -> list:
    try:
        with open("banned-words.json") as f:
            data = json.load(f)
            return data.get("banned", [])
    except Exception:
        return []


def extract_template_sections(resolved_template: str) -> list[str]:
    """Pull the H2-level section headings from a resolved template.

    Templates label heading levels with literal prefixes (`## H1:`, `## H2:`).
    The H1 is the page title; H2s are the section structure the output must
    match exactly. Returns the cleaned H2 heading texts in order.
    """
    sections: list[str] = []
    for raw in resolved_template.splitlines():
        line = raw.strip()
        if not line.startswith("#"):
            continue
        # Strip leading markdown hashes and an optional "H2:"/"H3:" label.
        text = line.lstrip("#").strip()
        m = re.match(r"^H([1-6])\s*:\s*(.*)$", text, flags=re.IGNORECASE)
        if m:
            level, text = int(m.group(1)), m.group(2).strip()
        else:
            level = len(line) - len(line.lstrip("#"))
        if level == 2 and text:
            sections.append(text)
    return sections


def resolve_template_placeholders(
    template_content: str,
    keyword: str,
    brand_name: str,
    city: str,
    state: str,
) -> str:
    """Replace [service], [location], [city], [brand], etc. in template."""
    result = template_content
    location = f"{city}, {state}" if state else city

    replacements = {
        r"\[service\]": keyword,
        r"\[keyword\]": keyword,
        r"\[brand\]": brand_name,
        r"\[brand name\]": brand_name,
        r"\[company\]": brand_name,
        r"\[owner name\]": brand_name,
        r"\[location\]": location,
        r"\[city\]": city,
        r"\[area\]": location,
        r"\[state\]": state,
    }
    for pattern, replacement in replacements.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    return result


def _voice_dimension_line(key: str, value: int) -> str:
    """Convert a numeric voice slider into a concrete behavioral instruction."""
    if value <= 30:
        return (
            f"- {key}: low. Keep {key} out of the writing almost entirely; "
            f"default to plain, neutral phrasing on this dimension."
        )
    if value <= 70:
        return (
            f"- {key}: moderate. Let {key} come through where it fits naturally, "
            f"but do not make it a defining feature of the writing."
        )
    return (
        f"- {key}: high. Make {key} a consistent, defining quality of the writing; "
        f"the reader should notice it in most paragraphs."
    )


def build_system_prompt(
    template: dict | None = None,
    style_examples: list | None = None,
    services: list | None = None,
    voice_dimensions: list | None = None,
    voice_notes: str | None = None,
    brand_banned_words: list | None = None,
    brand_guidelines: str | None = None,
    brand_competitors: list | None = None,
    prompt_learnings: list | None = None,
    franchise_mode: bool = False,
) -> list:
    """Build the system prompt for content generation.

    When franchise_mode is True, the local-business / multi-city / AI-Overview
    framing is suppressed: franchise recruitment pages have no city, so those
    rules misdirect the model toward generic local-page habits. Voice, banned
    words, anti-slop prose rules, and brand guidelines are kept.

    Returns a list of system content blocks. All content here is per-brand
    stable (rules, voice, guidelines, banned words, learnings, style
    examples), so the last block carries cache_control for prompt caching;
    per-city volatile content (keyword, location, enrichment, terms,
    research, brand template with resolved placeholders) goes in the user
    message instead.

    Cache note: the base rules alone run ~900-1200 tokens, and brands with
    style examples add up to 3 x 4000 chars (~3000 tokens), so for typical
    brands this prefix comfortably exceeds the ~2048-token minimum cacheable
    prefix for claude-sonnet-4-6. Brands with no style examples and no
    guidelines may fall below the minimum and silently skip caching, which
    is harmless.

    NOTE: the brand content template is intentionally NOT in this prefix.
    Its placeholders ([city], [service], ...) resolve per page, which would
    make the prefix volatile and defeat caching across a batch of cities.
    """
    banned = _load_banned_words()
    if brand_banned_words:
        banned = banned + brand_banned_words

    parts = [
        "You are an expert SEO content writer who understands modern search algorithms.",
        "",
        "WRITING APPROACH (Google Helpful Content + E-E-A-T):",
        "- Write from a first-person business perspective. Use 'we', 'our team', 'our specialists'.",
        "- Demonstrate real expertise: reference specific processes, tools, materials, or techniques the business uses.",
        "- Include concrete details that only someone in this industry would know (not generic filler).",
        "- Every section should answer a specific question a searcher would have.",
        "- Prioritize being genuinely useful over being keyword-rich. Helpfulness drives rankings.",
    ]

    if not franchise_mode:
        parts += [
            "",
            "AI OVERVIEW OPTIMIZATION:",
            "- The first paragraph under each H2 should directly answer the question implied by the heading.",
            "- Use clear, concise, factual statements that Google can extract for AI Overviews.",
            "- Structure information in a way that is easy to cite: definitions, lists, step-by-step processes.",
            "- Address 'People Also Ask' and AI fanout queries naturally within the content.",
            "",
            "FEATURED SNIPPET FORMATTING:",
            "- Use numbered lists for processes and steps.",
            "- Use bullet lists for features, benefits, and options.",
            "- Use short, direct paragraphs (2-4 sentences) that can stand alone as answers.",
            "- When defining a concept, lead with a clear one-sentence definition.",
        ]

    parts += [
        "",
        "CONTENT STRUCTURE:",
        "- Write in Markdown format.",
        "- Start with an H1 title (# Title) that includes the primary keyword naturally.",
        "  (If a brand template is provided and its H1 conflicts with keyword placement, the template wins; see the template rules in the task.)",
        "- Use H2 (##) for main sections and H3 (###) for subsections.",
        "- Opening paragraph: address the searcher's intent directly. Use the primary keyword in the first 100 words.",
        "- Body: each section adds unique value. No filler paragraphs. No restating the same point in different words.",
        "- Closing: clear, specific call-to-action. Not generic.",
        "",
        "ENTITY AND NLP OPTIMIZATION:",
        "- Use the full entity name on first reference (e.g., 'spray foam insulation'), then natural variations.",
        "- Co-reference related entities that Google associates with the topic.",
    ]

    if not franchise_mode:
        parts.append("- Use location entities naturally: city, neighborhoods, landmarks, regional details.")

    parts += [
        "- Incorporate required terms at their target counts, but never at the expense of readability.",
        "",
        "PROSE QUALITY (do these, always):",
        "- Vary sentence length and paragraph length; mix short punchy sentences with longer ones.",
        "- Never open a section with a rhetorical question.",
        "- Never use 'Whether you're X or Y' constructions.",
        "- Prefer concrete nouns and specific details over abstractions.",
        "- Do not default to three-beat parallel lists ('fast, reliable, and affordable'); break the rhythm.",
        "",
        "CRITICAL FORMATTING RULES:",
        "- Never use em dashes. Use commas, periods, or semicolons instead.",
        "- No filler phrases or padding. Every sentence should carry information.",
        "- No generic conclusions like 'contact us today for more information'. Be specific about what the reader should do next.",
    ]

    if banned:
        parts.append("")
        parts.append("BANNED WORDS AND PHRASES (never use these):")
        for word in banned:
            parts.append(f'- "{word}"')

    if voice_dimensions:
        lines = [
            _voice_dimension_line(d.get("key", ""), int(d.get("value", 0) or 0))
            for d in voice_dimensions
            if d.get("key")
        ]
        if lines:
            parts.append("")
            parts.append("VOICE TONE DIMENSIONS (calibrate your writing to these):")
            parts.extend(lines)

    if voice_notes:
        parts.append("")
        parts.append("VOICE INSTRUCTIONS (follow these exactly):")
        parts.append(voice_notes)

    if template:
        parts.append("")
        parts.append("CRITICAL - TEMPLATE STRUCTURE: You have been provided with a content template.")
        parts.append("Follow the template structure exactly. Replace placeholders with real content.")
        parts.append("Maintain the same heading hierarchy, section order, and formatting.")

    if style_examples:
        parts.append("")
        parts.append("CRITICAL - VOICE AND STYLE: Match the voice from the style examples below.")
        parts.append("Match: sentence structure, vocabulary, paragraph length, tone, heading style, reader engagement.")

    if services:
        parts.append("")
        parts.append("SERVICES THIS BUSINESS OFFERS (reference only these):")
        for s in services:
            parts.append(f"- {s}")
        parts.append("Do NOT mention services not in this list.")

    if brand_competitors:
        parts.append("")
        parts.append("COMPETITORS (DO NOT mention these by name, ever):")
        for c in brand_competitors:
            parts.append(f"- {c}")

    parts.append("")
    parts.append("BUSINESS NAMING (CRITICAL):")
    parts.append("- The page is for ONE business. Only name that business.")
    parts.append("- Never name any other company, contractor, agency, or vendor, even if their content or name appears in the reference material below. Reference material is for understanding the topic, not for sourcing business names.")

    if not franchise_mode:
        parts.append("")
        parts.append("MULTI-CITY ANTI-DUPLICATION (CRITICAL):")
        parts.append("- This brand publishes many city pages. Vary section angles, openings, examples, and sentence rhythm for THIS city.")
        parts.append("- Content that could be published unchanged for another city is a failure.")
        parts.append("- Openings must not be reusable across cities: anchor them in this city's specifics.")

    if brand_guidelines:
        parts.append("")
        parts.append("BRAND GUIDELINES (follow these strictly):")
        parts.append(brand_guidelines)

    if prompt_learnings:
        parts.append("")
        parts.append("LEARNED PATTERNS (from past content generations for this brand - apply these):")
        for learning in prompt_learnings[-10:]:
            parts.append(f"- {learning}")

    blocks = [{"type": "text", "text": "\n".join(parts)}]

    if style_examples:
        style_parts = ["STYLE REFERENCE EXAMPLES - MATCH THIS VOICE:"]
        for i, ex in enumerate(style_examples[:3]):
            content = ex.get("content", "")[:4000]
            style_parts.append(f"=== STYLE EXAMPLE: {ex.get('title', f'Example {i+1}')} ===")
            style_parts.append(content)
            style_parts.append("=== END EXAMPLE ===")
        blocks.append({"type": "text", "text": "\n".join(style_parts)})

    # Cache breakpoint on the last stable block: everything above is
    # per-brand stable, everything in the user message is per-city volatile.
    blocks[-1]["cache_control"] = {"type": "ephemeral"}
    return blocks


def with_role_block(system_blocks: list, role_text: str) -> list:
    """Append a task-specific role block AFTER the cached brand prefix.

    Keeps the cached prefix byte-identical across the generation, critique,
    and revision calls so they all hit the same cache entry.
    """
    return list(system_blocks) + [{"type": "text", "text": role_text}]


CONTENT_TYPE_LABELS = {
    "landing_page": "city landing page",
    "service_page": "service page",
    "blog_post": "blog post",
    "product_page": "product page",
}

CONTENT_TYPE_INSTRUCTIONS = {
    "landing_page": "This is a city-specific landing page. Lead with the city name and local relevance. Include a strong H1 with the keyword and city. Address local homeowners directly. End with a location-specific CTA (free estimate, call today, etc.).",
    "service_page": "This is a service-specific page. Lead with the service name. Explain what the service is, who needs it, and how your process works. Include pricing context if relevant. End with a CTA to schedule or get a quote.",
    "blog_post": "This is an informational blog post. Lead with a question or problem the reader has. Provide genuinely useful information they can act on. Be educational, not salesy. Light CTA at the end.",
    "product_page": "This is a product page. Lead with the product/solution name and what it does. Include specifications, benefits, and use cases. Compare to alternatives if relevant. Clear purchase/inquiry CTA.",
}


def build_user_prompt(
    keyword: str,
    city: str,
    state: str,
    brief: dict,
    template: dict | None = None,
    outline: dict | None = None,
    competitors: list | None = None,
    paa_questions: list | None = None,
    style_examples: list | None = None,  # kept for compat; style examples now live in the system prompt
    local_context: dict | None = None,
    content_type: str = "landing_page",
    research: dict | None = None,
    brand_template: str | None = None,
    brand_name: str = "",
) -> str:
    """Build user prompt with all per-city context for full content generation."""
    target_word_count = brief.get("target_word_count", 1500)
    word_count_min = brief.get("word_count_min", 0)
    word_count_max = brief.get("word_count_max", 0)
    term_targets = brief.get("term_targets", [])
    variations = brief.get("variations", [])
    competitor_headings = brief.get("competitor_headings", [])
    recommended_headings = brief.get("recommended_heading_count", 0)

    type_label = CONTENT_TYPE_LABELS.get(content_type, "landing page")
    type_instructions = CONTENT_TYPE_INSTRUCTIONS.get(content_type, "")

    parts = [
        f"Write a {type_label} for **{city}, {state}**.",
        "",
        f"**Content type:** {type_label}",
        f"**Primary Keyword:** {keyword}",
        f"**Target Word Count:** {target_word_count} words",
    ]

    if type_instructions:
        parts.append(f"**Content type instructions:** {type_instructions}")

    if word_count_min and word_count_max:
        parts.append(f"  (Competitor range: {word_count_min}-{word_count_max} words, avg {brief.get('word_count_avg', 0)})")

    if variations:
        parts.append(f"**Keyword Variations (use naturally):** {', '.join(variations[:10])}")

    # LSA phrases (semantically related terms Google associates with this topic)
    lsa_phrases = brief.get("lsa_phrases", [])
    if lsa_phrases:
        lsa_text = []
        for lsa in lsa_phrases[:15]:
            if isinstance(lsa, dict):
                phrase = lsa.get("phrase", "")
                avg = lsa.get("averageCount", 0)
                if phrase:
                    lsa_text.append(f"{phrase} (~{avg}x)")
            elif isinstance(lsa, str):
                lsa_text.append(lsa)
        if lsa_text:
            parts.append(f"**LSA/Semantic Terms (weave naturally throughout):** {', '.join(lsa_text)}")

    if recommended_headings:
        parts.append(f"**Recommended H2 count:** {recommended_headings} (based on top-ranking pages)")

    if competitor_headings:
        parts.append("**Common competitor headings (use as inspiration, do not copy):**")
        for h in competitor_headings[:10]:
            parts.append(f"  - {h}")

    # Local context (location-specific details)
    if local_context:
        parts.append("")
        parts.append(f"**LOCAL CONTEXT (load-bearing, not optional):**")
        parts.append(f"- REQUIREMENT: every H2 section must include at least one {city}-specific detail drawn from this local context or from the research local hooks.")
        parts.append(f"- The opening paragraph must be anchored in {city} specifics; it must not be reusable for another city.")
        if local_context.get("team_lead"):
            parts.append(f"- Team lead: {local_context['team_lead']}")
        if local_context.get("neighborhoods"):
            neighborhoods = local_context["neighborhoods"]
            if isinstance(neighborhoods, list):
                parts.append(f"- Key neighborhoods served: {', '.join(neighborhoods)}")
        if local_context.get("local_landmarks"):
            landmarks = local_context["local_landmarks"]
            if isinstance(landmarks, list):
                parts.append(f"- Local landmarks: {', '.join(landmarks)}")
            elif isinstance(landmarks, str) and landmarks:
                parts.append(f"- Local landmarks: {landmarks}")
        if local_context.get("common_job"):
            parts.append(f"- Most common job type: {local_context['common_job']}")
        if local_context.get("local_challenge"):
            parts.append(f"- Local challenge: {local_context['local_challenge']}")
        if local_context.get("fun_fact"):
            parts.append(f"- Local connection: {local_context['fun_fact']}")
        if local_context.get("certifications"):
            certs = local_context["certifications"]
            if isinstance(certs, list):
                parts.append(f"- Certifications: {', '.join(certs)}")
        if local_context.get("climate_notes"):
            parts.append(f"- Climate: {local_context['climate_notes']}")
        if local_context.get("seasonal_notes"):
            parts.append(f"- Seasonal patterns: {local_context['seasonal_notes']}")
        if local_context.get("housing_notes"):
            parts.append(f"- Housing stock: {local_context['housing_notes']}")
        if local_context.get("general_notes"):
            parts.append(f"- Additional notes: {local_context['general_notes']}")
        if local_context.get("competitors_to_avoid"):
            comps = local_context["competitors_to_avoid"]
            if isinstance(comps, list):
                parts.append(f"- DO NOT mention these competitors: {', '.join(comps)}")
        if local_context.get("reviews"):
            reviews = local_context["reviews"]
            if isinstance(reviews, list) and len(reviews) > 0:
                parts.append("- **Customer reviews to quote (use 1-2 naturally in the content):**")
                for r in reviews[:3]:
                    author = r.get("author", "Customer")
                    text = r.get("text", "")
                    if text:
                        parts.append(f'  - "{text}" - {author}')

    parts.append("")

    # Approved outline. When a brand template also exists, the template is
    # the structural skeleton and the outline contributes content guidance.
    if outline and not brand_template:
        parts.append("**APPROVED OUTLINE (follow this structure):**")
        parts.append(f"H1: {outline.get('h1', keyword)}")
        for section in outline.get("sections", []):
            parts.append(f"## {section.get('h2', '')}")
            for point in section.get("key_points", []):
                parts.append(f"  - {point}")
        if outline.get("internal_links"):
            parts.append("")
            parts.append("**Internal links to include:**")
            for link in outline["internal_links"]:
                parts.append(f'- [{link.get("text", "")}]({link.get("href", "")})')
        parts.append("")
    elif outline and brand_template:
        outline_points = []
        for section in outline.get("sections", []):
            for point in section.get("key_points", []):
                if point:
                    outline_points.append(point)
        if outline_points:
            parts.append("**TOPICAL COVERAGE (weave into the existing template sections):**")
            parts.append(
                "These are topics worth covering. The brand content template below is "
                "the authoritative structure. Distribute this coverage INTO the template's "
                "existing sections where each topic fits naturally. Do NOT create new "
                "sections, headings, or H2s for these topics -- the output must use only "
                "the template's sections."
            )
            for point in outline_points[:20]:
                parts.append(f"- {point}")
            parts.append("")

    # Notion template (if also provided, use as additional reference)
    if template and template.get("content"):
        parts.append("**TEMPLATE (follow this structure exactly):**")
        parts.append(f"```\n{template['content']}\n```")
        parts.append("")

    # POP brief terms
    if term_targets:
        sorted_terms = sorted(term_targets, key=lambda t: t.get("weight", 0), reverse=True)[:30]
        parts.append("**POP Content Brief - Term Usage Targets:**")
        for t in sorted_terms:
            phrase = t.get("phrase", "")
            target = t.get("target", 0)
            if target > 0:
                low = max(1, target - 1)
                high = target + 1
                parts.append(f'- "{phrase}" - aim for {low}-{high} uses')
        parts.append("Readability beats exact counts. If hitting a target would force awkward phrasing, use fewer. Never stuff.")
        parts.append("")

    # Competitor content
    if competitors:
        parts.append("**TOP COMPETITOR CONTENT (write better than these):**")
        for comp in competitors[:3]:
            parts.append(f"--- {comp.get('title', 'Competitor')} ({comp.get('url', '')}) ---")
            parts.append(comp.get("content", "")[:2000])
        parts.append("")

    # PAA questions
    if paa_questions:
        parts.append("**People Also Ask (address these in the content):**")
        for q in paa_questions[:8]:
            parts.append(f"- {q}")
        parts.append("")

    if research:
        parts.append("**RESEARCH INSIGHTS (apply these to make the content stronger):**")
        if research.get("search_intent"):
            parts.append(f"- Search intent: {research['search_intent']} - {research.get('intent_details', '')}")
        if research.get("content_gaps"):
            parts.append("- Content gaps competitors miss: " + "; ".join(research["content_gaps"][:5]))
        if research.get("key_entities"):
            parts.append("- Key entities to mention: " + ", ".join(research["key_entities"][:8]))
        if research.get("differentiation_angles"):
            parts.append("- Stand out by: " + "; ".join(research["differentiation_angles"][:3]))
        if research.get("local_hooks"):
            parts.append("- Local hooks to weave in: " + "; ".join(research["local_hooks"][:4]))
        if research.get("topic_clusters"):
            parts.append("- Related subtopics for authority: " + ", ".join(research["topic_clusters"][:5]))
        parts.append("")

    # Brand content template -- LAST so it is the most recent instruction the model sees.
    # The template is the load-bearing structural authority for the output.
    # It stays in the (volatile) user prompt rather than the cached system
    # prefix because its placeholders resolve per page.
    if brand_template:
        resolved = resolve_template_placeholders(
            brand_template, keyword=keyword, brand_name=brand_name,
            city=city, state=state,
        )
        parts.append("---")
        parts.append("**BRAND CONTENT TEMPLATE (this is the required structure for your output):**")
        parts.append("")
        section_titles = extract_template_sections(resolved)
        if section_titles:
            parts.append(
                f"Your output must contain EXACTLY these {len(section_titles)} H2 sections, "
                "in this order, and NO others. Do not add, remove, merge, split, reorder, "
                "or duplicate sections. You may rephrase a heading for SEO but it must map "
                "1:1 to the same section in the same position:"
            )
            for i, title in enumerate(section_titles, 1):
                parts.append(f"{i}. {title}")
            parts.append("")
            parts.append(
                f"That is {len(section_titles)} H2 sections total (plus the single H1 title). "
                "If you find yourself writing a section that does not map to one of the above, "
                "stop -- that topic belongs inside an existing section, not a new one."
            )
            parts.append("")
        parts.append("STRUCTURE -- MUST MATCH EXACTLY:")
        parts.append("- Keep every section in the same order as the template.")
        parts.append("- Preserve every heading and its hierarchy level. If the template uses literal labels like `## H1:`, `## H2:`, `### H3:` as heading prefixes, those indicate the INTENDED markdown level (H1 = `#`, H2 = `##`, H3 = `###`). Convert them to the correct markdown level in your output and do NOT include the literal `H1:` / `H2:` / `H3:` text.")
        parts.append("- Preserve every structural element present in the template: lists (with the same item count), blockquotes, `<Button>...</Button>` CTA elements (output them as-is, in the same positions), tables, callouts, FAQ blocks, contact-info bullets.")
        parts.append("- Do not add new sections, remove sections, or reorder sections.")
        parts.append("- If the template's H1 conflicts with keyword placement, follow the template and work the keyword into the opening paragraph instead.")
        parts.append("")
        parts.append("CONTENT -- CREATIVE FREEDOM WITHIN EACH SECTION:")
        parts.append("- Rewrite body copy using the POP term targets, research insights, local context, and brand voice. Do not copy template placeholder copy verbatim.")
        parts.append("- You may rephrase heading text to be SEO-relevant, but keep the level and position.")
        parts.append(f"- The brand name is **{brand_name or 'this business'}**. Use it where the template references the brand.")
        parts.append("")
        parts.append("BUSINESS NAMING RULE:")
        parts.append(f"- The ONLY business you may name is **{brand_name or 'this business'}** (and natural local variants like '{(brand_name or 'this business')} of {city}').")
        parts.append("- Do not name any other company, contractor, or business. This applies even if competitor names appear in the competitor content above -- treat that content as inspiration for what to write about, not as a source of business names.")
        parts.append("")
        parts.append("Template:")
        parts.append(f"```\n{resolved}\n```")
        parts.append("")

    if brand_template:
        parts.append("Write the complete content now. Follow the brand content template structure exactly. Make it comprehensive, well-structured, and locally specific to this city.")
    else:
        parts.append("Write the complete content now. Make it comprehensive, well-structured, and locally specific to this city.")
    return "\n".join(parts)


# -- Structured output schemas (output_config json_schema format) --

RESEARCH_SCHEMA = {
    "type": "object",
    "properties": {
        "search_intent": {"type": "string"},
        "intent_details": {"type": "string"},
        "content_gaps": {"type": "array", "items": {"type": "string"}},
        "key_entities": {"type": "array", "items": {"type": "string"}},
        "differentiation_angles": {"type": "array", "items": {"type": "string"}},
        "questions_to_answer": {"type": "array", "items": {"type": "string"}},
        "format_signals": {
            "type": "object",
            "properties": {
                "recommended_format": {"type": "string"},
                "avg_sections": {"type": "integer"},
                "uses_lists": {"type": "boolean"},
            },
            "required": ["recommended_format", "avg_sections", "uses_lists"],
            "additionalProperties": False,
        },
        "local_hooks": {"type": "array", "items": {"type": "string"}},
        "topic_clusters": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "search_intent", "intent_details", "content_gaps", "key_entities",
        "differentiation_angles", "questions_to_answer", "format_signals",
        "local_hooks", "topic_clusters",
    ],
    "additionalProperties": False,
}

OUTLINE_SCHEMA = {
    "type": "object",
    "properties": {
        "h1": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "h2": {"type": "string"},
                    "key_points": {"type": "array", "items": {"type": "string"}},
                    "suggested_terms": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["h2", "key_points", "suggested_terms"],
                "additionalProperties": False,
            },
        },
        "estimated_word_count": {"type": "integer"},
    },
    "required": ["h1", "sections", "estimated_word_count"],
    "additionalProperties": False,
}

LEARNINGS_SCHEMA = {
    "type": "object",
    "properties": {
        "learnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["learnings"],
    "additionalProperties": False,
}


def build_research_prompt(
    keyword: str,
    city: str,
    state: str,
    brief: dict,
    serp_data: dict | None = None,
    competitors: list | None = None,
    paa_questions: list | None = None,
) -> tuple:
    """Build system + user prompts for pre-outline research analysis. Returns (system, user)."""
    system = (
        "You are an SEO research analyst. Analyze the provided SERP data, competitor content, "
        "and SEO brief to produce a structured research brief that will guide content creation.\n\n"
        "Return ONLY valid JSON with this structure:\n"
        '{\n'
        '  "search_intent": "primary intent (informational | transactional | local_service | comparison)",\n'
        '  "intent_details": "1-2 sentence description of what the searcher really wants",\n'
        '  "content_gaps": ["things top competitors miss or do poorly"],\n'
        '  "key_entities": ["specific people, places, services, certifications, tools to mention for E-E-A-T"],\n'
        '  "differentiation_angles": ["unique angles to stand out from competitors"],\n'
        '  "questions_to_answer": ["synthesized questions from PAA + competitor gaps"],\n'
        '  "format_signals": {"recommended_format": "listicle|guide|faq|narrative", "avg_sections": 8, "uses_lists": true},\n'
        '  "local_hooks": ["specific local details, events, landmarks, regulations to reference"],\n'
        '  "topic_clusters": ["related subtopics that strengthen topical authority"]\n'
        '}'
    )

    user_parts = [
        f'Analyze the search landscape for "{keyword}" in {city}, {state}.',
        "",
    ]

    # POP brief data
    terms = brief.get("term_targets", [])
    if terms:
        top_terms = sorted(terms, key=lambda t: t.get("weight", 0), reverse=True)[:20]
        user_parts.append("**Top SEO terms by weight:**")
        for t in top_terms:
            user_parts.append(f'  - "{t.get("phrase", "")}" (target: {t.get("target", 0)}x, weight: {t.get("weight", 0)})')

    variations = brief.get("variations", [])
    if variations:
        user_parts.append(f"\n**Keyword variations:** {', '.join(variations[:10])}")

    lsa = brief.get("lsa_phrases", [])
    if lsa:
        lsa_text = []
        for item in lsa[:15]:
            if isinstance(item, dict):
                lsa_text.append(item.get("phrase", ""))
            elif isinstance(item, str):
                lsa_text.append(item)
        if lsa_text:
            user_parts.append(f"\n**LSA/semantic terms:** {', '.join(lsa_text)}")

    pop_headings = brief.get("competitor_headings", [])
    if pop_headings:
        user_parts.append("\n**Competitor headings (from POP):**")
        for h in pop_headings[:12]:
            user_parts.append(f"  - {h}")

    # SERP data
    if serp_data:
        organic = serp_data.get("organic_results", [])
        if organic:
            user_parts.append("\n**Top organic results:**")
            for r in organic[:5]:
                user_parts.append(f"  - {r.get('title', '')} ({r.get('url', '')})")

        related = serp_data.get("related_searches", [])
        if related:
            user_parts.append(f"\n**Related searches:** {', '.join(related[:8])}")

    # PAA questions
    if paa_questions:
        user_parts.append("\n**People Also Ask + AI fanout queries:**")
        for q in paa_questions[:10]:
            user_parts.append(f"  - {q}")

    # Scraped competitor content
    if competitors:
        user_parts.append("\n**Scraped competitor content (top 3 ranking pages):**")
        for comp in competitors[:3]:
            user_parts.append(f"\n--- {comp.get('title', 'Competitor')} ({comp.get('url', '')}) ---")
            headings = comp.get("headings", [])
            if headings:
                user_parts.append("Headings: " + " | ".join(h.get("text", "") for h in headings[:8]))
            content_preview = (comp.get("content") or "")[:1500]
            if content_preview:
                user_parts.append(f"Content preview: {content_preview}")

    user_parts.append("\nAnalyze this data and return the research brief as JSON.")
    return system, "\n".join(user_parts)


def build_outline_prompt(
    keyword: str,
    city: str,
    state: str,
    brief: dict,
    template: dict | None = None,
    paa: list | None = None,
    competitors: list | None = None,
    research: dict | None = None,
) -> tuple:
    """Build system + user prompts for outline generation. Returns (system, user)."""
    system = (
        "You are an SEO content strategist. Generate a content outline as JSON.\n"
        "Never use em dashes. Return ONLY valid JSON, no markdown fences.\n"
        "Do NOT include internal_links in the output.\n\n"
        "Output format:\n"
        '{"h1": "...", "sections": [{"h2": "...", "key_points": ["..."], "suggested_terms": ["..."]}], '
        '"estimated_word_count": 1500}'
    )

    target_wc = brief.get("target_word_count", 1500)
    terms = brief.get("term_targets", [])
    variations = brief.get("variations", [])
    pop_headings = brief.get("competitor_headings", [])
    recommended_h2 = brief.get("recommended_heading_count", 0)

    user_parts = [
        f"Create a content outline for a landing page targeting \"{keyword}\" in {city}, {state}.",
        f"Target word count: {target_wc}",
    ]

    if recommended_h2:
        user_parts.append(f"Target approximately {recommended_h2} H2 sections (based on top-ranking competitors).")

    if terms:
        top_terms = sorted(terms, key=lambda t: t.get("weight", 0), reverse=True)[:15]
        user_parts.append("Key terms to incorporate:")
        for t in top_terms:
            user_parts.append(f'  - "{t.get("phrase", "")}" ({t.get("target", 0)}x)')

    if variations:
        user_parts.append(f"Keyword variations to use naturally: {', '.join(variations[:8])}")

    if pop_headings:
        user_parts.append("Competitor headings from POP analysis (use as inspiration):")
        for h in pop_headings[:10]:
            user_parts.append(f"  - {h}")

    if paa:
        user_parts.append("People Also Ask questions (good H2 candidates):")
        for q in paa[:6]:
            user_parts.append(f"  - {q}")

    if competitors:
        user_parts.append("Scraped competitor headings for reference:")
        for comp in competitors[:3]:
            for h in (comp.get("headings") or [])[:5]:
                user_parts.append(f"  - {h.get('text', '')}")

    if template and template.get("content"):
        user_parts.append(f"Follow this template structure:\n{template['content'][:2000]}")

    if research:
        user_parts.append("\n**RESEARCH ANALYSIS (use these insights to shape the outline):**")
        if research.get("search_intent"):
            user_parts.append(f"- Search intent: {research['search_intent']}")
        if research.get("intent_details"):
            user_parts.append(f"- Intent details: {research['intent_details']}")
        if research.get("content_gaps"):
            user_parts.append("- Content gaps to fill: " + "; ".join(research["content_gaps"][:5]))
        if research.get("differentiation_angles"):
            user_parts.append("- Differentiation angles: " + "; ".join(research["differentiation_angles"][:3]))
        if research.get("questions_to_answer"):
            user_parts.append("- Questions to answer: " + "; ".join(research["questions_to_answer"][:6]))
        if research.get("local_hooks"):
            user_parts.append("- Local hooks: " + "; ".join(research["local_hooks"][:4]))
        if research.get("topic_clusters"):
            user_parts.append("- Topic clusters: " + "; ".join(research["topic_clusters"][:5]))
        fmt = research.get("format_signals", {})
        if fmt:
            user_parts.append(f"- Recommended format: {fmt.get('recommended_format', 'guide')}, ~{fmt.get('avg_sections', 8)} sections")

    user_parts.append("\nReturn the outline as JSON.")
    return system, "\n".join(user_parts)


CRITIQUE_ROLE = (
    "TASK ROLE OVERRIDE: For this request you are acting as a senior content editor, "
    "not the writer. Critique the draft against the brand rules above. Do NOT rewrite "
    "the draft. Return a numbered list of at most 8 concrete, specific edits, covering "
    "(only where genuinely weak):\n"
    "1. Brand voice adherence (tone dimensions, voice notes, style examples).\n"
    "2. Locality: every H2 section should be grounded in a city-specific detail; "
    "flag sections that could be published unchanged for another city.\n"
    "3. Slop patterns: banned words, formulaic rhythm, rhetorical-question openers, "
    "'Whether you're X or Y' constructions, three-beat parallel lists, generic filler.\n"
    "4. Redundancy: points restated across sections.\n"
    "5. Template/outline compliance: missing, reordered, or extra sections.\n"
    "Each edit must quote or pinpoint the text to change and say exactly what to do "
    "instead. If an area is already strong, do not invent edits for it. If the draft "
    "needs no edits, return exactly: NO EDITS NEEDED. Output only the list (or that phrase)."
)

EDITORIAL_REVISION_ROLE = (
    "TASK ROLE OVERRIDE: For this request you are revising an existing draft. Apply the "
    "editor's requested edits faithfully. Preserve the overall structure, headings, "
    "term usage, and word count. Do not introduce banned words. Never use em dashes. "
    "Output the complete revised content in Markdown, nothing else."
)


def build_critique_user_prompt(
    content: str,
    keyword: str,
    city: str,
    state: str,
    outline: dict | None = None,
    brand_template: str | None = None,
    local_context: dict | None = None,
) -> str:
    """User prompt for the editorial critique pass."""
    parts = [
        f"**Primary keyword:** {keyword}",
        f"**Target city:** {city}, {state}",
    ]
    if outline and outline.get("sections"):
        parts.append("**Approved outline sections:** " + " | ".join(
            s.get("h2", "") for s in outline.get("sections", []) if s.get("h2")
        ))
    if brand_template:
        tmpl_sections = extract_template_sections(brand_template)
        if tmpl_sections:
            parts.append(
                f"**Required template structure: EXACTLY these {len(tmpl_sections)} H2 "
                "sections, in order, no others.** Flag any section in the draft that is "
                "not one of these as an extra section to delete (fold its content into the "
                "right section); flag any of these that is missing:"
            )
            for i, t in enumerate(tmpl_sections, 1):
                parts.append(f"{i}. {t}")
        else:
            parts.append("**Brand template (required structure, truncated):**")
            parts.append(f"```\n{brand_template[:3000]}\n```")
    if local_context:
        hooks = []
        for k in ("neighborhoods", "local_landmarks", "local_challenge", "common_job",
                  "climate_notes", "seasonal_notes", "housing_notes", "fun_fact"):
            v = local_context.get(k)
            if isinstance(v, list):
                v = ", ".join(str(x) for x in v)
            if v:
                hooks.append(f"{k}: {v}")
        if hooks:
            parts.append("**Available local details the draft should be using:**")
            for h in hooks:
                parts.append(f"- {h}")
    parts.append("")
    parts.append("**DRAFT TO CRITIQUE:**")
    parts.append(f"```\n{content}\n```")
    parts.append("")
    parts.append("Return the numbered edit list now.")
    return "\n".join(parts)


def build_editorial_revision_user_prompt(content: str, edits: str) -> str:
    """User prompt for applying the critique edits."""
    return "\n".join([
        "**CURRENT DRAFT:**",
        f"```\n{content}\n```",
        "",
        "**EDITOR'S REQUESTED EDITS (apply all of these):**",
        edits,
        "",
        "Output the complete revised draft now.",
    ])


def build_revision_prompts(
    content: str,
    keyword: str,
    brief: dict,
    pop_feedback: dict,
) -> tuple:
    """Build system + user prompts for term-count revision. Returns (system, user)."""
    system = (
        "You are an SEO content editor. Revise content based on POP optimization feedback.\n"
        "Never use em dashes. Use commas, periods, or semicolons instead.\n"
        "Maintain the existing structure and voice. Output the complete revised content in Markdown.\n"
        "This draft has already been through an editorial quality pass: do NOT undo its "
        "improvements (varied rhythm, city-specific details, voice). Only weave in the "
        "missing terms and apply the recommendations, with the lightest possible touch."
    )

    user_parts = [
        f"**Primary Keyword:** {keyword}",
        "",
        "**CURRENT CONTENT:**",
        f"```\n{content}\n```",
        "",
        "**POP SCORE FEEDBACK:**",
    ]

    if pop_feedback.get("recommendations"):
        for rec in pop_feedback["recommendations"]:
            user_parts.append(f"- {rec}")

    if pop_feedback.get("missing"):
        user_parts.append("\n**MISSING TERMS (add these naturally):**")
        for m in pop_feedback["missing"]:
            user_parts.append(f'- "{m.get("phrase", "")}" - need {m.get("target", 0)}x, currently {m.get("current", 0)}x')

    target_wc = brief.get("target_word_count", 1500)
    user_parts.append(f"\nTarget word count: {target_wc}")
    user_parts.append("\nRevise the content. Incorporate missing terms naturally. Do not change the overall structure or voice, and keep the editorial improvements intact.")

    return system, "\n".join(user_parts)


def build_learning_prompt(
    keyword: str,
    city: str,
    score: dict | None,
    revision_count: int,
    word_count: int,
    brief: dict | None,
    feedback: str | None = None,
) -> tuple:
    """Build prompt for Haiku to extract learnings from a completed generation."""
    system = (
        "You are analyzing a completed content generation to extract learnings for future generations.\n"
        'Return ONLY JSON of the form {"learnings": ["..."]} with 1-3 short, actionable learnings.\n'
        "Focus on patterns that would improve FUTURE content for this brand, not one-off fixes.\n"
        "If the generation went well (score >= 80, 0 revisions), note what worked.\n"
        "If it struggled (low score, multiple revisions, missing terms), note what to emphasize next time.\n"
        'Example: {"learnings": ["Emphasize the term \\"spray foam\\" more heavily - consistently underused",\n'
        '"Shorter intros (2-3 sentences) score better for service pages",\n'
        '"Local neighborhood references improved engagement"]}'
    )

    user_parts = [
        f"**Keyword:** {keyword}",
        f"**City:** {city}",
        f"**Final word count:** {word_count}",
        f"**Revision rounds needed:** {revision_count}",
    ]

    if score:
        user_parts.append(f"**POP score:** {score.get('overall_score', 'N/A')}/100")
        if score.get("missing"):
            missing = [m.get("phrase", "") for m in score["missing"][:5] if m.get("phrase")]
            if missing:
                user_parts.append(f"**Still missing terms:** {', '.join(missing)}")
        if score.get("well_optimized"):
            well = [w.get("phrase", "") for w in score["well_optimized"][:5] if w.get("phrase")]
            if well:
                user_parts.append(f"**Well-optimized terms:** {', '.join(well)}")
        if score.get("recommendations"):
            user_parts.append("**POP recommendations:**")
            for rec in score["recommendations"][:3]:
                user_parts.append(f"  - {rec}")

    if brief:
        target_wc = brief.get("target_word_count", 0)
        if target_wc:
            user_parts.append(f"**Target word count was:** {target_wc} (actual: {word_count})")

    if feedback:
        user_parts.append(f"**User feedback given:** {feedback}")

    user_parts.append('\nExtract 1-3 learnings and return them as {"learnings": [...]}.')
    return system, "\n".join(user_parts)
