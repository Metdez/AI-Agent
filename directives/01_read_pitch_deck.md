# Directive: Read Pitch Deck

## Goal
Extract raw text from a pitch deck file (PDF or PPTX) dropped into `input/`.

## Inputs
- A single file in `input/` — either `.pdf`, `.pptx`, or `.ppt`
- If multiple files exist, use the most recently modified one

## Execution Scripts
- `execution/file_router.py` — detects file type, routes to correct reader
- `execution/pdf_reader.py` — extracts text from PDF (with OCR fallback for image-based PDFs)
- `execution/pptx_reader.py` — extracts text from PPTX including slide notes

## Process
1. Scan `input/` for supported file types (.pdf, .pptx, .ppt)
2. If none found, stop and tell the user to drop a pitch deck in `input/`
3. Route the file through `execution/file_router.py`
4. Truncate output to `MAX_PDF_CHARS` (30,000 chars) to stay within LLM context limits
5. Save raw text to `.tmp/pitch_text.txt` for downstream steps

## Outputs
- Raw text string (saved to `.tmp/pitch_text.txt`)
- Character count logged to console

## Edge Cases
- **Image-based PDF**: OCR fallback via pytesseract. If pytesseract/poppler not installed, raise clear error with install instructions.
- **Corrupted/password-protected file**: Catch exception, print clear error, exit cleanly.
- **Unsupported format (.jpg, .docx, etc.)**: Raise ValueError with supported formats listed.
- **Empty extraction (<100 chars for PDF, <50 chars for PPTX)**: Trigger OCR or raise error.

## Dependencies
- pypdf, pdf2image, pytesseract (OCR), python-pptx
