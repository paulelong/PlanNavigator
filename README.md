# Plan Navigator

Interactive PDF navigator for construction plan documents with clickable cross-references between plan sheets.

## Features

- **Interactive Web Viewer**: Navigate PDF plans with thumbnail strip and clickable cross-references
- **Python Extraction Tool**: Scans PDFs for tags (for potential future enhancements)
- **PDF Annotation Tool**: Create clickable links in the PDF itself
- **VSCode Integration**: Tasks and launch configurations for development

## Project Structure

```
PlanNavigator/
├── .vscode/              # VSCode workspace configuration
│   ├── settings.json     # Editor and Python settings
│   ├── tasks.json        # Build and run tasks
│   ├── launch.json       # Debug configurations
│   └── extensions.json   # Recommended extensions
├── tools/                # Python scripts
│   ├── extract_tags.py   # Tag extraction tool
│   └── annotate_pdf.py   # PDF annotation tool
├── viewer/               # Web viewer
│   ├── index.html        # Main viewer interface
│   ├── main.js           # Viewer logic
│   └── pdfjs/            # PDF.js library (download separately)
├── package.json          # NPM configuration
├── requirements.txt      # Python dependencies
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## Setup Instructions (PowerShell)

### 1. Create Python Virtual Environment

```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment
.\.venv\Scripts\Activate.ps1

# If you get an execution policy error, run:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 2. Install Python Dependencies

```powershell
# Make sure virtual environment is activated
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 3. Download PDF.js

PDF.js is required for the web viewer. Download and extract it:

```powershell
# Create the pdfjs directory
New-Item -ItemType Directory -Path "viewer\pdfjs" -Force

# Download PDF.js (version 3.11.174 or latest)
# Option 1: Download manually from https://github.com/mozilla/pdf.js/releases
# Extract the "build" folder to viewer/pdfjs/build/

# Option 2: Use git to clone the prebuilt version
cd viewer
git clone --depth 1 --branch v3.11.174 https://github.com/mozilla/pdfjs-dist.git pdfjs-temp
Move-Item pdfjs-temp\build pdfjs\build
Remove-Item pdfjs-temp -Recurse -Force
cd ..
```

**Manual Download Instructions:**
1. Go to https://github.com/mozilla/pdf.js/releases
2. Download the latest release (e.g., `pdfjs-3.11.174-dist.zip`)
3. Extract the archive
4. Copy the `build` folder to `viewer\pdfjs\build\`
5. Verify that `viewer\pdfjs\build\pdf.js` and `viewer\pdfjs\build\pdf.worker.js` exist

### 4. Install Node Dependencies

```powershell
# Install http-server globally (recommended)
npm install -g http-server

# Or install locally in project
npm install
```

### 5. Place Your PDF

Copy your PDF file to the project root:

```powershell
# Example:
Copy-Item "C:\path\to\2024_05_24 90_ CD Set.pdf" .
```

## Usage

### Start the Web Viewer

```powershell
# Option 1: Using npm script
npm start

# Option 2: Direct http-server command
http-server viewer -p 8080 -o --cors

# The viewer will open in your browser at http://localhost:8080
```

**Important:** Update the PDF filename in `viewer\main.js` (line 9) if your PDF has a different name:
```javascript
const PDF_FILE = '/your-pdf-filename.pdf';
```

The viewer now displays:
- **Thumbnail strip** at the top showing all pages with AC labels
- **Main PDF canvas** with zoom controls and page navigation
- **Clickable cross-references** - any reference like "09/AC401" in the PDF is automatically clickable and will navigate to that sheet

### Extract Tags from PDF (Optional)

This tool is available if you want to generate a tag index for future enhancements:

```powershell
# Make sure virtual environment is activated
.\.venv\Scripts\Activate.ps1

# Run extraction
.\.venv\Scripts\python.exe tools\extract_tags.py "2024_05_24 90_ CD Set.pdf"

# This creates index.json in the project root
```

### Create Annotated PDF (Optional)

```powershell
# Make sure virtual environment is activated and index.json exists
.\.venv\Scripts\python.exe tools\annotate_pdf.py "2024_05_24 90_ CD Set.pdf" "annotated_output.pdf"
```

## VSCode Tasks

Use the Command Palette (`Ctrl+Shift+P`) and run "Tasks: Run Task":

- **Extract Tags from PDF**: Run the extraction tool
- **Start Viewer Server**: Start the web server
- **Annotate PDF with Links**: Create annotated PDF
- **Install Python Dependencies**: Install requirements.txt
- **Install NPM Dependencies**: Run npm install

## VSCode Debugging

Press `F5` or use the Debug panel to run:

- **Python: Extract Tags**: Debug the extraction script
- **Python: Annotate PDF**: Debug the annotation script
- **Python: Current File**: Debug the currently open Python file

## Quick Start Runbook

```powershell
# 1. Create and activate virtual environment (optional - only needed for Python tools)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install Python dependencies (optional)
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Download PDF.js (manual or git - see instructions above)
# Ensure viewer\pdfjs\build\pdf.js exists

# 4. Install Node dependencies
npm install -g http-server

# 5. Place your PDF in the project root
# Update viewer\main.js line 9 with your PDF filename

# 6. Start viewer
npm start

# The viewer opens at http://localhost:8080
# Use thumbnails, page navigation buttons, or click cross-references in the PDF
```

## Troubleshooting

### PowerShell Execution Policy Error
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### PDF.js Not Loading
- Verify `viewer\pdfjs\build\pdf.js` and `viewer\pdfjs\build\pdf.worker.js` exist
- Check browser console for errors
- Ensure the file paths in `viewer\index.html` are correct

### Python Module Not Found
```powershell
# Make sure virtual environment is activated
.\.venv\Scripts\Activate.ps1

# Reinstall dependencies
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### Viewer Shows CORS Errors
- Use http-server with `--cors` flag (included in npm start script)
- Don't open index.html directly in browser (file:// protocol won't work)

## License

MIT
