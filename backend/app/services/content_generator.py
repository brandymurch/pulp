"""Prompt assembly for content generation, outlines, and revisions."""
from __future__ import annotations
import json
import re
from typing import Any, Optional


def _load_banned_words() -> list:
    try:
        with open("banned-words.json") as f:
            data = json.load(f)
            return data.get("banned", [])
    except Exception:
        return []


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


def build_system_prompt(
    template: Optional[dict] = None,
    style_examples: Optional[list] = None,
    services: Optional[list] = None,
    voice_dimensions: Optional[list] = None,
    voice_notes: Optional[str] = None,
    brand_banned_words: Optional[list] = None,
    brand_guidelines: Optional[str] = None,
) -> str:
    """Build system prompt for content generation."""
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
        "",
        "CONTENT STRUCTURE:",
        "- Write in Markdown format.",
        "- Start with an H1 title (# Title) that includes the primary keyword naturally.",
        "- Use H2 (##) for main sections and H3 (###) for subsections.",
        "- Opening paragraph: address the searcher's intent directly. Use the primary keyword in the first 100 words.",
        "- Body: each section adds unique value. No filler paragraphs. No restating the same point in different words.",
        "- Closing: clear, specific call-to-action. Not generic.",
        "",
        "ENTITY AND NLP OPTIMIZATION:",
        "- Use the full entity name on first reference (e.g., 'spray foam insulation'), then natural variations.",
        "- Co-reference related entities that Google associates with the topic.",
        "- Use location entities naturally: city, neighborhoods, landmarks, regional details.",
        "- Incorporate required terms at their target counts, but never at the expense of readability.",
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
        dims_with_values = [d for d in voice_dimensions if d.get("value", 0) > 0]
        if dims_with_values:
            parts.append("")
            parts.append("VOICE TONE DIMENSIONS (calibrate your writing to match these levels, 0=none, 100=maximum):")
            for d in dims_with_values:
                parts.append(f"- {d['key']}: {d['value']}/100")

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
        parts.append("CRITICAL - VOICE AND STYLE: Match the voice from the provided style examples.")
        parts.append("Match: sentence structure, vocabulary, paragraph length, tone, heading style, reader engagement.")

    if services:
        parts.append("")
        parts.append("SERVICES THIS BUSINESS OFFERS (reference only these):")
        for s in services:
            parts.append(f"- {s}")
        parts.append("Do NOT mention services not in this list.")

    if brand_guidelines:
        parts.append("")
        parts.append("BRAND GUIDELINES (follow these strictly):")
        parts.append(brand_guidelines)

    return "\n".join(parts)


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
    template: Optional[dict] = None,
    outline: Optional[dict] = None,
    competitors: Optional[list] = None,
    paa_questions: Optional[list] = None,
    style_examples: Optional[list] = None,
    local_context: Optional[dict] = None,
    content_type: str = "landing_page",
) -> str:
    """Build user prompt with all context for full content generation."""
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

    if recommended_headings:
        parts.append(f"**Recommended H2 count:** {recommended_headings} (based on top-ranking pages)")

    if competitor_headings:
        parts.append("**Common competitor headings (use as inspiration, do not copy):**")
        for h in competitor_headings[:10]:
            parts.append(f"  - {h}")

    # Local context (location-specific details)
    if local_context:
        parts.append("")
        parts.append("**LOCAL CONTEXT (weave these details naturally into the content):**")
        if local_context.get("team_lead"):
            parts.append(f"- Team lead: {local_context['team_lead']}")
        if local_context.get("neighborhoods"):
            neighborhoods = local_context["neighborhoods"]
            if isinstance(neighborhoods, list):
                parts.append(f"- Key neighborhoods served: {', '.join(neighborhoods)}")
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
        if local_context.get("housing_notes"):
            parts.append(f"- Housing stock: {local_context['housing_notes']}")
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

    # Approved outline
    if outline:
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

    # Template
    if template and template.get("content"):
        parts.append("**TEMPLATE (follow this structure exactly):**")
        parts.append(f"```\n{template['content']}\n```")
        parts.append("")

    # POP brief terms
    if term_targets:
        sorted_terms = sorted(term_targets, key=lambda t: t.get("weight", 0), reverse=True)[:30]
        parts.append("**POP Content Brief - Required Term Usage:**")
        for t in sorted_terms:
            phrase = t.get("phrase", "")
            target = t.get("target", 0)
            if target > 0:
                parts.append(f'- "{phrase}" - use {target}x')
        parts.append("")

    # Style examples
    if style_examples:
        parts.append("**STYLE REFERENCE EXAMPLES - MATCH THIS VOICE:**")
        for i, ex in enumerate(style_examples[:3]):
            content = ex.get("content", "")[:4000]
            parts.append(f"=== STYLE EXAMPLE: {ex.get('title', f'Example {i+1}')} ===")
            parts.append(content)
            parts.append("=== END EXAMPLE ===")
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

    parts.append("Write the complete content now. Make it comprehensive, well-structured, and locally relevant.")
    return "\n".join(parts)


def build_outline_prompt(
    keyword: str,
    city: str,
    state: str,
    brief: dict,
    template: Optional[dict] = None,
    paa: Optional[list] = None,
    competitors: Optional[list] = None,
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

    user_parts.append("\nReturn the outline as JSON.")
    return system, "\n".join(user_parts)


def build_revision_prompts(
    content: str,
    keyword: str,
    brief: dict,
    pop_feedback: dict,
) -> tuple:
    """Build system + user prompts for content revision. Returns (system, user)."""
    system = (
        "You are an SEO content editor. Revise content based on POP optimization feedback.\n"
        "Never use em dashes. Use commas, periods, or semicolons instead.\n"
        "Maintain the existing structure and voice. Output the complete revised content in Markdown."
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
    user_parts.append("\nRevise the content. Incorporate missing terms naturally. Do not change the overall structure or voice.")

    return system, "\n".join(user_parts)
