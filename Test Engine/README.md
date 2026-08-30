# MockS Test Engine & Feed Ingestion Pipeline

This directory powers automated real-time data ingestion for MockS across all 5 exam categories:

1. **Feed/**: Real-time exam notification parsers, official vacancy RSS monitors, and feed sync to Supabase.
2. **Scraper/**: Clean scrapers for official exam portals (MPPSC, NTA, SSC, CBSE) and PDF question extractors.
3. **Mini AI/**: Lightweight OCR text clean-up, question splitting, and deterministic format normalization.
4. **Generative AI Model/**: Gemini AI prompts for generating authentic mock tests, solution explanations, and difficulty calibration.
5. **From Repository/**: Open PYQ databases, GitHub/HuggingFace question repositories, and categorized JSON bundles.