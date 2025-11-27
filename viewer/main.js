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

// Global state
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.5;
// Cache of page -> AC label
const pageLabels = new Map();

// DOM elements
const canvas = document.getElementById('pdf-canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
const currentPageSpan = document.getElementById('current-page');
const totalPagesSpan = document.getElementById('total-pages');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomResetBtn = document.getElementById('zoom-reset');
const thumbnailStrip = document.getElementById('thumbnail-strip');
let linkOverlays = [];

// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs/build/pdf.worker.js';

/**
 * Initialize the application
 */
async function init() {
  try {
    // Load PDF
    pdfDoc = await pdfjsLib.getDocument(PDF_FILE).promise;
    totalPages = pdfDoc.numPages;
    totalPagesSpan.textContent = totalPages;
    
    console.log('Loaded PDF:', PDF_FILE, 'Pages:', totalPages);
    
    // Generate thumbnails
    await generateThumbnails();

    // Fit page to window and render initial page from URL or first
    const urlState = parseUrlState();
    const startPage = urlState.page && urlState.page >= 1 && urlState.page <= totalPages ? urlState.page : 1;
    await fitPageToWindow(startPage);

    // Enable navigation buttons
    updateNavigationButtons();
/**
 * Fit the PDF page to the window (canvas container) and render it
 */
async function fitPageToWindow(pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  // Get container size, accounting for padding (20px on each side = 40px total)
  const padding = 40;
  const containerWidth = canvasContainer.clientWidth - padding;
  const containerHeight = canvasContainer.clientHeight - padding;
  // Get unscaled page size
  const unscaledViewport = page.getViewport({ scale: 1 });
  // Calculate scale to fit
  const scaleX = containerWidth / unscaledViewport.width;
  const scaleY = containerHeight / unscaledViewport.height;
  scale = Math.min(scaleX, scaleY);
  // Render page with new scale
  await renderPage(pageNum);
}  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to load PDF. Check console for details.');
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
    const acTag = await getPageAcLabel(pageNum);
    
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
      pushUrlState({ page: pageNum });
    });
    
    thumbnails.push(thumbItem);
  }
  
  // Clear and populate thumbnail strip
  thumbnailStrip.innerHTML = '';
  thumbnails.forEach(thumb => thumbnailStrip.appendChild(thumb));
  
  console.log(`Generated ${thumbnails.length} thumbnails`);
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
  // Push state when user-driven navigation occurs (avoid duplicate pushes during popstate handling)
  
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

  // After rendering, overlay clickable links detected from text
  await renderPageLinks(pageNum, page);
}

/**
 * Clear all highlight overlays
 */
function clearHighlights() {
  const highlights = canvasContainer.querySelectorAll('.highlight-overlay');
  highlights.forEach(h => h.remove());
}

function clearLinkOverlays() {
  linkOverlays.forEach(el => el.remove());
  linkOverlays = [];
}

async function renderPageLinks(pageNum, pageObj) {
  clearLinkOverlays();
  try {
    const page = pageObj || await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: scale });
    const content = await page.getTextContent();
    const items = content.items || [];

    // Match page refs like 09/AC401 (2 digits, slash, AC + 3-4 digits)
    const refRegex = /\b(\d{2})\/(AC\d{3,4})\b/i;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const str = item.str || '';
      const match = str.match(refRegex);
      if (!match) continue;

      const refText = `${match[1]}/${match[2].toUpperCase()}`;

      // Transform text matrix into viewport space
      // item.transform is the text matrix; combine with viewport.transform to get pixel coords
      const tm = item.transform;
      const m = pdfjsLib.Util.transform(viewport.transform, tm); // [a, b, c, d, e, f]
      const [a, b, c, d, e, f] = m;

      // Text orientation and font size
      const fontSize = Math.hypot(a, b);
      const angleRad = Math.atan2(b, a); // rotation in radians
      const angleDeg = Math.round(angleRad * 180 / Math.PI);
      const isVertical = Math.abs(Math.abs(angleDeg) - 90) <= 10; // treat ~90° as vertical

      // Compute width/height in viewport pixels
      // Use character count * average char width (fontSize * 0.5 for monospace-like approximation)
      const charWidth = fontSize * 0.5;
      let width = refText.length * charWidth;
      let height = fontSize;

      // For vertical text, swap width/height and adjust position to cover the column
      if (isVertical) {
        const tmp = width;
        width = height;
        height = tmp;
      }

      // Position: e,f are the text origin in viewport space (baseline).
      // Use canvas bounding rect to be robust to layout/padding/scroll.
      const canvasRect = canvas.getBoundingClientRect();
      const containerRect = canvasContainer.getBoundingClientRect();
      const originLeft = canvasRect.left - containerRect.left;
      const originTop = canvasRect.top - containerRect.top;

      let left = originLeft + e;
      let top = originTop + (f - height);

      // For vertical text, shift box to better align along the glyph run
      if (isVertical) {
        // Nudge left slightly to center over rotated text; heuristic
        left -= width * 0.25;
        // Vertical text tends to report baseline mid-run; lift overlay more
        top = originTop + (f - height * 0.9);
      }

      // Create overlay element
      const overlay = document.createElement('div');
      overlay.className = 'link-overlay';
      overlay.style.position = 'absolute';
      overlay.style.left = `${left}px`;
      overlay.style.top = `${top}px`; // baseline -> top
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      overlay.style.border = '1px dashed rgba(0, 102, 204, 0.4)';
      overlay.style.background = 'rgba(0, 102, 204, 0.05)';
      overlay.style.cursor = 'pointer';
      overlay.title = `Go to ${refText}`;

      overlay.addEventListener('click', async () => {
        const targetPage = resolveTargetPageForRef(refText);
        if (targetPage) {
          await renderPage(targetPage);
          pushUrlState({ page: targetPage, tag: match[2].toUpperCase() });
        }
      });

      canvasContainer.appendChild(overlay);
      linkOverlays.push(overlay);
    }
  } catch (err) {
    console.warn('renderPageLinks failed:', err);
  }
}

function resolveTargetPageForRef(refText) {
  // refText like "09/AC401" -> key by AC code to find page
  const acCodeMatch = refText.match(/AC\d{3,4}/i);
  const acCode = acCodeMatch ? acCodeMatch[0].toUpperCase() : null;
  if (!acCode) return null;

  // Search through page labels to find a matching AC code
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const label = pageLabels.get(pageNum);
    if (label && label.toUpperCase() === acCode) {
      return pageNum;
    }
  }
  return null;
}

/**
 * Update navigation button states
 */
function updateNavigationButtons() {
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
}

// Event listeners for navigation
prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
    pushUrlState({ page: currentPage });
  }
});

nextPageBtn.addEventListener('click', () => {
  if (currentPage < totalPages) {
    renderPage(currentPage + 1);
    pushUrlState({ page: currentPage });
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
    pushUrlState({ page: currentPage });
  } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
    renderPage(currentPage + 1);
    pushUrlState({ page: currentPage });
  }
});


// Re-fit page on window resize
window.addEventListener('resize', () => {
  if (pdfDoc) {
    fitPageToWindow(currentPage);
  }
});

// Initialize the application
init();

// --- History and URL state management ---

function pushUrlState(state) {
  const params = new URLSearchParams();
  if (state.page) params.set('page', String(state.page));
  const url = `${location.pathname}?${params.toString()}`;
  history.pushState(state, '', url);
}

function parseUrlState() {
  const params = new URLSearchParams(location.search);
  const page = params.has('page') ? parseInt(params.get('page'), 10) : undefined;
  return { page };
}

window.addEventListener('popstate', async (event) => {
  const state = event.state || parseUrlState();
  if (!pdfDoc) return;
  const page = state.page && state.page >= 1 && state.page <= totalPages ? state.page : currentPage;
  await renderPage(page);
  clearHighlights();
});
