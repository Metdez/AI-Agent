"""
Execution: Entry point for all file reading. Routes by file extension.
"""

import os
from pathlib import Path


def route_file(file_path: str) -> str:
    """
    Route a file to the appropriate reader based on its extension.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    extension = Path(file_path).suffix.lower()

    if extension == ".pdf":
        from execution.pdf_reader import extract_text_from_pdf
        return extract_text_from_pdf(file_path)

    elif extension in (".pptx", ".ppt"):
        from execution.pptx_reader import extract_text_from_pptx
        return extract_text_from_pptx(file_path)

    else:
        raise ValueError(
            f"Unsupported file type: {extension}. Please upload a PDF or PPTX."
        )


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))

    input_dir = Path(__file__).parent.parent / "input"
    files = list(input_dir.iterdir())

    if not files:
        print("No files found in input/. Drop a pitch deck there to test.")
    else:
        target = files[0]
        print(f"Routing: {target.name}")
        try:
            text = route_file(str(target))
            print(f"Extracted {len(text)} characters.")
            print(f"First 300 chars:\n{text[:300]}")
        except (ValueError, FileNotFoundError) as e:
            print(f"Error: {e}")
