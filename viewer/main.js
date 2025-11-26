/**
 * main.js - Plan Navigator viewer logic
 * 
 * Connects PDF.js with the tag index to provide interactive navigation
 * between tagged items in construction plan PDFs.
 */

// Configuration
// When served from project root, use absolute paths from "/"
// Place your PDF in the project root next to index.json
const PDF_FILE = '/2024_05_24 90_ CD Set.pdf'; // Change if your filename differs
const INDEX_FILE = '/index.json';

// Global state
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
let tagIndex = null;
let selectedTag = null;
let currentOccurrenceIndex = null;
// Cache of page -> AC label
const pageLabels = new Map();

// DOM elements
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
const tagList = document.getElementById('tag-list');
const tagSearch = document.getElementById('tag-search');
const inspectorContent = document.getElementById('inspector-content');
const inspectorTitle = document.getElementById('inspector-title');
const currentPageSpan = document.getElementById('current-page');
const totalPagesSpan = document.getElementById('total-pages');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const thumbnailStrip = document.getElementById('thumbnail-strip');

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/build/pdf.worker.js';

/**
 * Initialize the application
 */
async function init() {
  try {
    // Load tag index
    tagIndex = await loadIndex();
    console.log('Loaded index:', tagIndex);
    
    // Render tag list
    renderTagList(tagIndex.tags);
    
    // Load PDF
    pdfDoc = await pdfjsLib.getDocument(PDF_FILE).promise;
    totalPages = pdfDoc.numPages;
    totalPagesSpan.textContent = totalPages;
    
    console.log('Loaded PDF:', PDF_FILE, 'Pages:', totalPages);
    
    // Generate thumbnails
    await generateThumbnails();
    
    // Render first page
    await renderPage(1);
    
    // Enable navigation buttons
    updateNavigationButtons();
    
  } catch (error) {
    console.error('Initialization error:', error);
    showError('Failed to load PDF or index. Check console for details.');
  }
}

/**
 * Load the tag index from JSON file
 */
async function loadIndex() {
  const response = await fetch(INDEX_FILE);
  if (!response.ok) {
    throw new Error(`Failed to load ${INDEX_FILE}`);
  }
  return await response.json();
}

/**
 * Render the tag list in the sidebar
 */
function renderTagList(tags) {
  const tagNames = Object.keys(tags).sort();
  
  if (tagNames.length === 0) {
    tagList.innerHTML = '<div class="loading">No tags found</div>';
    return;
  }
  
  tagList.innerHTML = '';
  
  tagNames.forEach(tagName => {
    const occurrences = tags[tagName];
    const tagItem = document.createElement('div');
    tagItem.className = 'tag-item';
    tagItem.dataset.tag = tagName;
    
    tagItem.innerHTML = `
      <div class="tag-name">${tagName}</div>
      <div class="tag-count">${occurrences.length} occurrence${occurrences.length !== 1 ? 's' : ''}</div>
    `;
    
    tagItem.addEventListener('click', () => selectTag(tagName));
    tagList.appendChild(tagItem);
  });
}

/**
 * Filter tag list based on search input
 */
tagSearch.addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const tagItems = tagList.querySelectorAll('.tag-item');
  
  tagItems.forEach(item => {
    const tagName = item.dataset.tag.toLowerCase();
    if (tagName.includes(searchTerm)) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
});

/**
 * Select a tag and show its occurrences
 */
function selectTag(tagName) {
  selectedTag = tagName;
  currentOccurrenceIndex = null;
  
  // Update tag list UI
  const tagItems = tagList.querySelectorAll('.tag-item');
  tagItems.forEach(item => {
    if (item.dataset.tag === tagName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Update inspector
  renderInspector(tagName);

  // Automatically jump to the first occurrence of this tag for quick navigation
  // Only do this if the PDF is loaded
  if (pdfDoc) {
    const occurrences = tagIndex.tags[tagName];
    if (occurrences && occurrences.length > 0) {
      jumpToOccurrence(tagName, 0);
    }
  }
}

/**
 * Render the inspector panel with tag occurrences
 */
function renderInspector(tagName) {
  const occurrences = tagIndex.tags[tagName];
  
  inspectorTitle.textContent = `Tag: ${tagName}`;
  inspectorContent.innerHTML = '';
  
  occurrences.forEach((occurrence, index) => {
    const occurrenceItem = document.createElement('div');
    occurrenceItem.className = 'occurrence-item';
    occurrenceItem.dataset.index = index;
    
    occurrenceItem.innerHTML = `
      <div class="occurrence-page">Page ${occurrence.page}</div>
      <div class="occurrence-snippet">${occurrence.snippet}</div>
    `;
    
    occurrenceItem.addEventListener('click', () => {
      jumpToOccurrence(tagName, index);
    });
    
    inspectorContent.appendChild(occurrenceItem);
  });
}

/**
 * Jump to a specific tag occurrence
 */
async function jumpToOccurrence(tagName, occurrenceIndex) {
  const occurrences = tagIndex.tags[tagName];
  const occurrence = occurrences[occurrenceIndex];
  
  currentOccurrenceIndex = occurrenceIndex;
  
  // Update inspector UI
  const occurrenceItems = inspectorContent.querySelectorAll('.occurrence-item');
  occurrenceItems.forEach((item, index) => {
    if (index === occurrenceIndex) {
      item.classList.add('current');
    } else {
      item.classList.remove('current');
    }
  });
  
  // Navigate to page
  await renderPage(occurrence.page);
  
  // Draw highlight overlay
  drawHighlight(occurrence.bbox);
}

/**
 * Generate thumbnails for all pages
 */
async function generateThumbnails() {
  thumbnailStrip.innerHTML = '<div style="color: #999; padding: 8px;">Generating thumbnails...</div>';
  
  const thumbnailScale = 0.075; // 50% smaller thumbnails
  const thumbnails = [];
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: thumbnailScale });
    
    // Create thumbnail container
    const thumbItem = document.createElement('div');
    thumbItem.className = 'thumbnail-item';
    thumbItem.dataset.page = pageNum;
    
    // Create canvas for thumbnail
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'thumbnail-canvas';
    thumbCanvas.width = viewport.width;
    thumbCanvas.height = viewport.height;
    
    const thumbCtx = thumbCanvas.getContext('2d');
    
    // Render thumbnail
    await page.render({
      canvasContext: thumbCtx,
      viewport: viewport
    }).promise;
    
    // Derive AC label from page text (prefer bottom-right title block)
    const acTag = await getPageAcLabel(pageNum) || getPrimaryTagForPage(pageNum);
    
    // Create label with page number and AC tag
    const label = document.createElement('div');
    label.className = 'thumbnail-label';
    label.textContent = acTag ? `${pageNum} - ${acTag}` : pageNum;
    
    // Assemble thumbnail
    thumbItem.appendChild(thumbCanvas);
    thumbItem.appendChild(label);
    
    // Add click handler
    thumbItem.addEventListener('click', () => {
      renderPage(pageNum);
    });
    
    thumbnails.push(thumbItem);
  }
  
  // Clear and populate thumbnail strip
  thumbnailStrip.innerHTML = '';
  thumbnails.forEach(thumb => thumbnailStrip.appendChild(thumb));
  
  console.log(`Generated ${thumbnails.length} thumbnails`);
}

/**
 * Get the primary tag for a given page (the first tag found on that page)
 */
function getPrimaryTagForPage(pageNum) {
  if (!tagIndex || !tagIndex.tags) return null;
  
  // Find the first tag that has an occurrence on this page
  for (const [tagName, occurrences] of Object.entries(tagIndex.tags)) {
    const hasPageOccurrence = occurrences.some(occ => occ.page === pageNum);
    if (hasPageOccurrence) {
      return tagName;
    }
  }
  
  return null;
}

/**
 * Extract AC label from the lower-right area of the page using PDF.js text content.
 * Chooses the match closest to bottom-right if multiple are present.
 */
async function getPageAcLabel(pageNum) {
  if (pageLabels.has(pageNum)) return pageLabels.get(pageNum);
  try {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    // Match only pure AC codes (AC followed by 3-4 digits), not tags like "02/AC513"
    const fullRegex = /\bAC\s*\d{3,4}\b/i;
    const acOnlyRegex = /^AC$/i;
    const digitsRegex = /^\d{3,4}$/;
    const tagPattern = /\d{2}\/AC\d{3,4}/i; // Pattern to exclude tags
    let best = null; // {text, x, y, score}

    const items = content.items;
    const brX = viewport.width;
    const brY = viewport.height;

    // Helper: distance to bottom-right
    function distToBR(x, y) {
      const dx = brX - x;
      const dy = brY - y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Precompute positions of "Sheet No." label to find nearby AC codes
    const sheetHints = [];
    for (let i = 0; i < items.length; i++) {
      const s = items[i].str.trim().toUpperCase();
      if (s.includes('SHEET') || s.includes('NO.') || s === 'NO' || s.includes('TITLE')) {
        const [, , , , ex, ey] = items[i].transform;
        const percentX = (ex / brX * 100).toFixed(0);
        const percentY = (ey / brY * 100).toFixed(0);
        sheetHints.push({ x: ex, y: ey, text: s, percentX, percentY });
      }
    }
    
    // Debug: show where Sheet labels are
    if (pageNum <= 3) {
      console.log(`Page ${pageNum} Sheet hints:`, sheetHints.map(h => `"${h.text}" at ${h.percentX}%x, ${h.percentY}%y (looking for >90%x, <20%y)`));
    }
    
    // If no sheet hints found, return null (prefer no label over wrong label)
    if (sheetHints.length === 0) {
      console.log(`Page ${pageNum}: No "Sheet No." label found, skipping AC detection`);
      return null;
    }

    // Find matches, score by proximity to BR and to sheet hints
    // Only consider bottom-right quadrant to avoid false matches from page body
    const candidates = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str = item.str.trim();
      const [a, b, c, d, e, f] = item.transform;
      const x = e;
      const y = f;

      // Filter to bottom-right region in PDF coords (rightmost 50%, bottommost 50%)
      // PDF.js uses bottom-left origin: low Y = bottom, high X = right
      const percentX = (x / brX);
      const percentY = (y / brY);
      if (percentX < 0.5 || percentY > 0.5) continue; // X > 50%, Y < 50% (bottom)

      // Skip if this is part of a tag pattern (e.g., "02/AC513")
      if (tagPattern.test(str)) continue;

      let matchText = null;
      if (fullRegex.test(str)) {
        matchText = (str.match(fullRegex) || [])[0].replace(/\s+/g, '').toUpperCase();
      } else if (acOnlyRegex.test(str)) {
        for (let k = 1; k <= 3; k++) {
          const next = items[i + k];
          if (!next) break;
          const nextStr = next.str.trim();
          if (digitsRegex.test(nextStr)) {
            matchText = `AC${nextStr}`.toUpperCase();
            break;
          }
        }
      }
      if (!matchText) continue;

      // Debug for page 1
      if (pageNum === 1) {
        console.log(`Page 1 found AC: "${matchText}" at ${(x/brX*100).toFixed(0)}%x, ${(y/brY*100).toFixed(0)}%y`);
      }

      // Base score: inverse of distance to bottom-right
      const dist = distToBR(x, y);
      let score = 10000 / (1 + dist);

      // Strong bonus: closeness to "Sheet No." label
      let minSheetDist = Infinity;
      for (const hint of sheetHints) {
        const dx = hint.x - x;
        const dy = hint.y - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        minSheetDist = Math.min(minSheetDist, d);
        score += 50000 / (1 + d); // Much higher weight for sheet proximity
      }

      // Only accept candidates close to "Sheet No." label (within ~200 units)
      if (minSheetDist > 200) continue;
      
      candidates.push({ text: matchText, x, y, score, dist, sheetDist: minSheetDist });
      
      if (!best || score > best.score) {
        best = { text: matchText, x, y, score };
      }
    }
    
    // Debug logging for troubleshooting
    console.log(`Page ${pageNum} AC candidates:`, candidates.length > 0 ? candidates.map(c => ({
      text: c.text,
      score: c.score.toFixed(0),
      sheetDist: c.sheetDist.toFixed(0)
    })) : 'None found (check if Sheet No. label exists)');

    const ac = best ? best.text : null;
    if (ac) pageLabels.set(pageNum, ac);
    return ac;
  } catch (err) {
    console.warn('AC label extraction failed for page', pageNum, err);
    return null;
  }
}

/**
 * Update active thumbnail indicator
 */
function updateThumbnailActive() {
  const thumbItems = thumbnailStrip.querySelectorAll('.thumbnail-item');
  thumbItems.forEach(item => {
    if (parseInt(item.dataset.page) === currentPage) {
      item.classList.add('active');
      // Scroll thumbnail into view
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      item.classList.remove('active');
    }
  });
}

/**
 * Render a PDF page on the canvas
 */
async function renderPage(pageNum) {
  currentPage = pageNum;
  currentPageSpan.textContent = pageNum;
  updateNavigationButtons();
  updateThumbnailActive();
  
  // Clear any existing highlights
  clearHighlights();
  
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: scale });
  
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };
  
  await page.render(renderContext).promise;
}

/**
 * Draw a highlight overlay on the canvas
 */
function drawHighlight(bbox) {
  // Remove any existing highlights
  clearHighlights();
  
  // Get current page to calculate viewport
  pdfDoc.getPage(currentPage).then(page => {
    const viewport = page.getViewport({ scale: scale });
    
    // Transform PDF coordinates to canvas coordinates
    const x = bbox.x0 * scale;
    const y = bbox.y0 * scale;
    const width = (bbox.x1 - bbox.x0) * scale;
    const height = (bbox.y1 - bbox.y0) * scale;
    
    // Create highlight overlay
    const highlight = document.createElement('div');
    highlight.className = 'highlight-overlay';
    highlight.style.left = `${x}px`;
    highlight.style.top = `${y}px`;
    highlight.style.width = `${width}px`;
    highlight.style.height = `${height}px`;
    
    canvasContainer.appendChild(highlight);
    
    // Scroll to make highlight visible
    const highlightRect = highlight.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    
    if (highlightRect.top < containerRect.top || highlightRect.bottom > containerRect.bottom) {
      highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

/**
 * Clear all highlight overlays
 */
function clearHighlights() {
  const highlights = canvasContainer.querySelectorAll('.highlight-overlay');
  highlights.forEach(h => h.remove());
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

/**
 * Show error message
 */
function showError(message) {
  tagList.innerHTML = `<div class="error">${message}</div>`;
}

// Event listeners for navigation
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
  }
});

// Event listeners for zoom
zoomInBtn.addEventListener('click', () => {
  scale *= 1.2;
  renderPage(currentPage);
});

zoomOutBtn.addEventListener('click', () => {
  scale /= 1.2;
  renderPage(currentPage);
});

zoomResetBtn.addEventListener('click', () => {
  scale = 1.5;
  renderPage(currentPage);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && currentPage > 1) {
    renderPage(currentPage - 1);
  } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
    renderPage(currentPage + 1);
  }
});

// Initialize the application
init();
