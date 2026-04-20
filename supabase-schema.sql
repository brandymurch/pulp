-- Brands
CREATE TABLE brands (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_tone TEXT DEFAULT 'professional and authoritative',
  default_content_type TEXT DEFAULT 'landing page',
  services JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Locations (prepared for future use)
CREATE TABLE locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  slug TEXT,
  status TEXT DEFAULT 'draft',
  local_context JSONB DEFAULT '{}',
  last_refresh_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_locations_brand_id ON locations(brand_id);

-- Style examples
CREATE TABLE style_examples (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_style_examples_brand_id ON style_examples(brand_id);

-- Drafts (prepared for future use)
CREATE TABLE drafts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  placement TEXT DEFAULT 'landing',
  title TEXT,
  content TEXT,
  outline TEXT,
  word_count INTEGER DEFAULT 0,
  pop_brief JSONB,
  pop_score JSONB,
  competitor_urls TEXT[] DEFAULT '{}',
  revision_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_drafts_brand_id ON drafts(brand_id);

-- Generations
CREATE TABLE generations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  keyword TEXT NOT NULL,
  city TEXT,
  content TEXT NOT NULL,
  outline TEXT,
  content_type TEXT,
  template_name TEXT,
  model TEXT DEFAULT 'sonnet',
  word_count INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  pop_brief JSONB,
  pop_score JSONB,
  revision_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_generations_brand_id ON generations(brand_id);
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);

-- RLS: enabled with open policies (app has own auth)
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE style_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON brands FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON locations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON style_examples FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON drafts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON generations FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger for brands
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed: USA Insulation brand
INSERT INTO brands (name, slug, default_tone, default_content_type, services)
VALUES (
  'USA Insulation',
  'usa-insulation',
  'professional, knowledgeable, and approachable',
  'landing page',
  '["Injection Foam Insulation", "Spray Foam Insulation", "Blown-In Insulation", "Air Sealing", "Attic Insulation", "Wall Insulation", "Crawl Space Insulation", "Garage Insulation", "Energy Audits"]'
);
