import * as pdfjsLib
  from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";

import { PageFlip }
  from "../page-flip-soft.module.js";


/* =========================================
   BROWSER COMPATIBILITY
   ========================================= */

if (
  typeof ReadableStream !== "undefined" &&
  typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function"
) {
  ReadableStream.prototype[Symbol.asyncIterator] =
    async function* () {

      const reader = this.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            return;
          }

          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    };
}


pdfjsLib.GlobalWorkerOptions.workerSrc =
  "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs";


const pdfPath =
  "./pdf/sample.pdf";


let pdfDocument = null;

let pageFlip = null;

let currentPageIndex = 0;

/* =========================================
   REDUCED MOTION PREFERENCE
   ========================================= */

const prefersReducedMotion =
  window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

/* =========================================
   ZOOM SETTINGS
   ========================================= */

let zoomLevel = 1;

const minimumZoom = 0.5;

const maximumZoom = 2.5;

const zoomStep = 0.25;


/* =========================================
   PAN SETTINGS
   ========================================= */

let panX = 0;

let panY = 0;

let isPanning = false;

let panStartX = 0;

let panStartY = 0;

let panStartOffsetX = 0;

let panStartOffsetY = 0;

/* =========================================
   INTERACTION TOOL
   ========================================= */

let activeTool =
  "select";

/* =========================================
   SEARCH STATE
   ========================================= */

/*
 * pageSearchData stores a searchable
 * representation of each rendered PDF
 * text layer.
 *
 * Each entry contains:
 *
 * text     = combined text for the page
 * segments = positions of the individual
 *            PDF.js text spans within that
 *            combined text
 */

const searchButton = document.getElementById("search-button");

const pageSearchData = [];


let searchMatches = [];

let currentSearchMatchIndex = -1;

let activeSearchQuery = "";


/* =========================================
   ELEMENTS
   ========================================= */

const book =
  document.getElementById(
    "book"
  );

const documentLoading =
  document.getElementById(
    "document-loading"
  );

const documentError =
  document.getElementById(
    "document-error"
  );


const bookViewport =
  document.querySelector(
    ".book-viewport"
  );


const bookWrapper =
  document.querySelector(
    ".book-wrapper"
  );


const pageNumberInput =
  document.getElementById(
    "page-number-input"
  );


const totalPagesDisplay =
  document.getElementById(
    "total-pages"
  );


const previousButton =
  document.getElementById(
    "previous-button"
  );


const nextButton =
  document.getElementById(
    "next-button"
  );


const zoomOutButton =
  document.getElementById(
    "zoom-out-button"
  );


const zoomInButton =
  document.getElementById(
    "zoom-in-button"
  );


const zoomResetButton =
  document.getElementById(
    "zoom-reset-button"
  );


const zoomDisplay =
  document.getElementById(
    "zoom-display"
  );

const selectToolButton =
  document.getElementById(
    "select-tool-button"
  );


const handToolButton =
  document.getElementById(
    "hand-tool-button"
  );

const searchInput =
  document.getElementById(
    "search-input"
  );


const searchPreviousButton =
  document.getElementById(
    "search-previous-button"
  );


const searchNextButton =
  document.getElementById(
    "search-next-button"
  );


const searchClearButton =
  document.getElementById(
    "search-clear-button"
  );


const searchResultsDisplay =
  document.getElementById(
    "search-results"
  );


/* =========================================
   INITIAL VIEWER STATE
   ========================================= */

bookViewport.style.opacity =
  "0";


/* =========================================
   LOAD PDF
   ========================================= */

async function loadPDF() {

  try {

    pdfDocument =
      await pdfjsLib
        .getDocument(
          pdfPath
        )
        .promise;


    totalPagesDisplay.textContent =
      pdfDocument.numPages;


    console.log(
      `PDF loaded: ${pdfDocument.numPages} pages`
    );


    await createPages();


    documentLoading.hidden = true;


    createFlipbook();

  } catch (error) {

    console.error(
      "Error loading PDF:",
      error
    );

    documentLoading.hidden = true;

    documentError.hidden = false;


    bookViewport.style.opacity =
      "1";

  }

}


/* =========================================
   CREATE PDF PAGES
   ========================================= */

async function createPages() {

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber++
  ) {

    const page =
      await pdfDocument.getPage(
        pageNumber
      );


    const viewport =
      page.getViewport({
        scale: 1.5
      });


    /*
     * Create page container.
     */

    const pageElement =
      document.createElement(
        "div"
      );


    pageElement.classList.add(
      "pdf-page"
    );


    pageElement.dataset.pageIndex =
      pageNumber - 1;


    pageElement.dataset.density =
      "soft";

    /*
 * Add an inner-edge gutter shadow to
 * interior pages only.
 *
 * Even PDF pages sit on the left side
 * of a spread, so their inner edge is
 * on the right.
 *
 * Odd PDF pages sit on the right side
 * of a spread, so their inner edge is
 * on the left.
 *
 * The front and back covers are excluded.
 */

    if (
      pageNumber !== 1 &&
      pageNumber !==
      pdfDocument.numPages
    ) {

      if (
        pageNumber % 2 === 0
      ) {

        pageElement.classList.add(
          "gutter-right"
        );

      } else {

        pageElement.classList.add(
          "gutter-left"
        );

      }

    }





    /*
     * Create visible PDF canvas.
     */

    const canvas =
      document.createElement(
        "canvas"
      );


    const context =
      canvas.getContext(
        "2d"
      );


    canvas.width =
      viewport.width;


    canvas.height =
      viewport.height;


    await page.render({
      canvasContext: context,
      viewport
    }).promise;


    pageElement.appendChild(
      canvas
    );


    /*
     * Create PDF.js text layer.
     */

    const textLayerElement =
      document.createElement(
        "div"
      );


    textLayerElement.classList.add(
      "textLayer"
    );


    textLayerElement.style.setProperty(
      "--total-scale-factor",
      viewport.scale
    );


    /*
     * Preserve the original PDF.js render
     * scale separately.
     *
     * Our PageFlip display-scale correction
     * uses this value later.
     */

    textLayerElement.dataset.renderScale =
      viewport.scale;


    pageElement.appendChild(
      textLayerElement
    );


    /*
     * Extract and render actual PDF text.
     */

    const textContent =
      await page.getTextContent();


    const textLayer =
      new pdfjsLib.TextLayer({

        textContentSource:
          textContent,

        container:
          textLayerElement,

        viewport

      });


    await textLayer.render();


    /*
     * Build search information from the
     * actual rendered text spans.
     *
     * Search therefore uses the same text
     * that the user can select.
     */

    buildPageSearchData(
      pageNumber - 1,
      textLayerElement
    );


    /*
     * Search highlights live in their own
     * overlay so we never have to modify the
     * PDF.js text spans.
     */

    const searchHighlightLayer =
      document.createElement(
        "div"
      );


    searchHighlightLayer.classList.add(
      "search-highlight-layer"
    );


    searchHighlightLayer.setAttribute(
      "aria-hidden",
      "true"
    );


    pageElement.appendChild(
      searchHighlightLayer
    );

    /*
     * Add interactive PDF hyperlinks.
     */

    await createPageLinks(
      page,
      viewport,
      pageElement
    );

    /*
     * Add completed page to book.
     */

    book.appendChild(
      pageElement
    );

  }

}

/* =========================================
   PDF HYPERLINKS
   ========================================= */

async function createPageLinks(
  page,
  viewport,
  pageElement
) {

  const annotations =
    await page.getAnnotations({
      intent: "display"
    });


  const linkLayer =
    document.createElement("div");


  linkLayer.className =
    "pdf-link-layer";


  for (const annotation of annotations) {

    if (
      annotation.subtype !== "Link" ||
      !annotation.rect
    ) {

      continue;

    }


    const link =
      document.createElement("a");


    link.className =
      "pdf-link";


    const rect =
      viewport.convertToViewportRectangle(
        annotation.rect
      );


    const left =
      Math.min(rect[0], rect[2]);

    const top =
      Math.min(rect[1], rect[3]);

    const width =
      Math.abs(rect[2] - rect[0]);

    const height =
      Math.abs(rect[3] - rect[1]);


    link.style.left =
      `${left / viewport.width * 100}%`;

    link.style.top =
      `${top / viewport.height * 100}%`;

    link.style.width =
      `${width / viewport.width * 100}%`;

    link.style.height =
      `${height / viewport.height * 100}%`;


    if (annotation.url) {

      let safeURL;

      try {

        safeURL =
          new URL(annotation.url);

      } catch {

        continue;

      }


      if (
        !["https:", "http:", "mailto:", "tel:"]
          .includes(safeURL.protocol)
      ) {

        continue;

      }


      link.href =
        safeURL.href;

      link.target =
        "_blank";

      link.rel =
        "noopener noreferrer";

      link.setAttribute(
        "aria-label",
        annotation.url
      );

    } else if (annotation.dest) {

      link.href = "#";

      link.setAttribute(
        "aria-label",
        "Go to linked document location"
      );


      link.addEventListener(
        "click",
        async (event) => {

          event.preventDefault();

          event.stopPropagation();

          await followPDFDestination(
            annotation.dest
          );

        }
      );

    } else {

      continue;

    }


    link.addEventListener(
      "click",
      (event) => {

        event.stopPropagation();

      }
    );


    linkLayer.appendChild(link);

  }


  pageElement.appendChild(linkLayer);

}


async function followPDFDestination(
  destination
) {

  if (!pageFlip || !pdfDocument) {

    return;

  }


  try {

    const resolvedDestination =
      typeof destination === "string"
        ? await pdfDocument.getDestination(destination)
        : destination;


    if (!resolvedDestination) {

      return;

    }


    const reference =
      resolvedDestination[0];


    const targetPageIndex =
      typeof reference === "number"
        ? reference
        : await pdfDocument.getPageIndex(reference);


    if (
      targetPageIndex >= 0 &&
      targetPageIndex < pdfDocument.numPages
    ) {

      pageFlip.turnToPage(
        targetPageIndex
      );

      pageFlip.getRender().update();

    }

  } catch (error) {

    console.error(
      "Unable to follow PDF link:",
      error
    );

  }

}


/* =========================================
   BUILD SEARCHABLE PAGE TEXT
   ========================================= */

function buildPageSearchData(
  pageIndex,
  textLayerElement
) {

  const spans =
    Array.from(
      textLayerElement
        .querySelectorAll(
          "span"
        )
    )
      .filter(
        (span) => {

          return (
            span.textContent &&
            span.textContent.length > 0
          );

        }
      );


  let pageText = "";

  const segments = [];


  spans.forEach(
    (span) => {

      const spanText =
        span.textContent;


      /*
       * PDF text is commonly divided into
       * separate positioned spans.
       *
       * Add a searchable space between spans
       * unless the surrounding text already
       * provides whitespace.
       */

      if (
        pageText.length > 0 &&
        !/\s$/.test(pageText) &&
        !/^\s/.test(spanText)
      ) {

        pageText += " ";

      }


      const start =
        pageText.length;


      pageText +=
        spanText;


      const end =
        pageText.length;


      segments.push({

        span,
        start,
        end

      });

    }
  );


  pageSearchData[
    pageIndex
  ] = {

    text:
      pageText,

    searchableText:
      normaliseSearchText(
        pageText
      ),

    segments

  };

}


/* =========================================
   SEARCH TEXT NORMALISATION
   ========================================= */

/*
 * For this first version, search is:
 *
 * - case-insensitive
 * - whitespace tolerant
 *
 * We deliberately do not alter punctuation,
 * accents or word endings.
 */

function normaliseSearchText(
  value
) {

  return value
    .toLocaleLowerCase()
    .replace(
      /\s+/g,
      " "
    );

}


/*
 * The page's searchable string must retain
 * a relationship to its original character
 * positions so highlights can be drawn.
 *
 * This function collapses whitespace while
 * recording which original character each
 * normalised character came from.
 */

function createNormalisedTextMap(
  value
) {

  let normalised = "";

  const originalPositions = [];

  let previousWasWhitespace =
    false;


  for (
    let index = 0;
    index < value.length;
    index++
  ) {

    const character =
      value[index];


    if (
      /\s/.test(
        character
      )
    ) {

      if (
        previousWasWhitespace
      ) {

        continue;

      }


      normalised +=
        " ";


      originalPositions.push(
        index
      );


      previousWasWhitespace =
        true;

      continue;

    }


    normalised +=
      character
        .toLocaleLowerCase();


    originalPositions.push(
      index
    );


    previousWasWhitespace =
      false;

  }


  return {

    text:
      normalised,

    originalPositions

  };

}

/* =========================================
   RESPONSIVE BOOK DIMENSIONS
   ========================================= */

function updateAvailableBookSize() {

  const firstPage =
    book.querySelector(".pdf-page canvas");

  if (!firstPage) {
    return;
  }


  const viewer =
    document.querySelector(".viewer");


  const bottomPadding =
    parseFloat(
      getComputedStyle(viewer).paddingBottom
    ) || 0;


  const availableHeight =
    window.innerHeight -
    (
      bookViewport.getBoundingClientRect().top +
      window.scrollY
    ) -
    bottomPadding;


  const availableWidth =
    bookViewport.clientWidth;


  const pageRatio =
    firstPage.width / firstPage.height;


  const fittedPageWidth =
    Math.floor(availableHeight * pageRatio);


  const useSpread =
    availableWidth >= 600 &&
    fittedPageWidth >= 300;


  const maximumBookWidth =
    useSpread
      ? fittedPageWidth * 2
      : Math.min(
        599,
        Math.max(300, fittedPageWidth)
      );


  bookWrapper.style.maxWidth =
    `${maximumBookWidth}px`;


  bookWrapper.style.margin =
    "0 auto";

}

/* =========================================
   CREATE FLIPBOOK
   ========================================= */

function createFlipbook() {

  const firstPage =
    book.querySelector(
      ".pdf-page canvas"
    );


  if (
    !firstPage
  ) {

    console.error(
      "No PDF pages were created."
    );


    bookViewport.style.opacity =
      "1";


    return;

  }


  const pageWidth =
    firstPage.width;


  const pageHeight =
    firstPage.height;


  updateAvailableBookSize();


  pageFlip =
    new PageFlip(
      book,
      {

        width:
          pageWidth,

        height:
          pageHeight,

        size:
          "stretch",

        minWidth:
          300,

        maxWidth:
          8192,

        minHeight:
          300 *
          (
            pageHeight /
            pageWidth
          ),

        maxHeight:
          8192 *
          (
            pageHeight /
            pageWidth
          ),

        maxShadowOpacity:
          0.45,

        showCover:
          true,

        mobileScrollSupport:
          false,

        disabledHardPages: true,

        usePortrait:
          true,

        flippingTime:
          prefersReducedMotion
            ? 1
            : 900,

        drawShadow:
          true,

        autoSize:
          true

      }
    );


  /*
   * Register init BEFORE loadFromHTML().
   */

  pageFlip.on(
    "init",
    (event) => {

      currentPageIndex =
        event.data.page;


      updatePageIndicator(
        currentPageIndex
      );


      updateCoverPosition();


      scheduleTextLayerScaleUpdate();


      scheduleSearchHighlightUpdate();


      bookViewport.style.opacity =
        "1";

    }
  );


  /*
   * Update after completed page turn.
   */

  pageFlip.on(
    "flip",
    (event) => {

      currentPageIndex =
        event.data;

      resetZoom();


      updatePageIndicator(
        currentPageIndex
      );


      updateCoverPosition();


      scheduleTextLayerScaleUpdate();


      scheduleSearchHighlightUpdate();

    }
  );


  pageFlip.loadFromHTML(
    document.querySelectorAll(
      ".pdf-page"
    )
  );

}


/* =========================================
   PDF TEXT LAYER DISPLAY SCALE
   ========================================= */

function updateTextLayerScale() {

  const pages =
    document.querySelectorAll(
      ".pdf-page"
    );


  pages.forEach(
    (pageElement) => {

      /*
       * PageFlip uses display:none for pages
       * that aren't currently being shown.
       */

      if (
        getComputedStyle(
          pageElement
        ).display ===
        "none"
      ) {

        return;

      }


      const canvas =
        pageElement.querySelector(
          "canvas"
        );


      const textLayer =
        pageElement.querySelector(
          ".textLayer"
        );


      if (
        !canvas ||
        !textLayer
      ) {

        return;

      }


      /*
       * Use CSS width rather than
       * getBoundingClientRect().
       *
       * #book can itself be transformed by
       * zoom/pan and that must not become
       * part of the PDF.js text scale.
       */

      const displayedWidth =
        parseFloat(
          getComputedStyle(
            canvas
          ).width
        );


      if (
        !displayedWidth ||
        canvas.width <= 0
      ) {

        return;

      }


      const renderScale =
        Number(
          textLayer
            .dataset
            .renderScale
        );


      if (
        !Number.isFinite(
          renderScale
        )
      ) {

        return;

      }


      const displayScale =
        displayedWidth /
        canvas.width;


      const correctedScale =
        renderScale *
        displayScale;


      textLayer.style.setProperty(
        "--total-scale-factor",
        correctedScale
      );

    }
  );

}


/*
 * PageFlip can finish changing page geometry
 * after its event fires.
 */

function scheduleTextLayerScaleUpdate() {

  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        () => {

          updateTextLayerScale();

        }
      );

    }
  );

}


/* =========================================
   SEARCH
   ========================================= */

function performSearch() {

  const query =
    searchInput
      .value
      .trim();


  clearSearchHighlights();


  searchMatches = [];

  currentSearchMatchIndex =
    -1;


  activeSearchQuery =
    query;


  if (
    !query
  ) {

    updateSearchControls();

    return;

  }


  const normalisedQuery =
    normaliseSearchText(
      query
    );


  if (
    !normalisedQuery
  ) {

    updateSearchControls();

    return;

  }


  pageSearchData.forEach(
    (
      pageData,
      pageIndex
    ) => {

      if (
        !pageData
      ) {

        return;

      }


      const mappedText =
        createNormalisedTextMap(
          pageData.text
        );


      let searchStart =
        0;


      while (
        searchStart <=
        mappedText.text.length -
        normalisedQuery.length
      ) {

        const matchIndex =
          mappedText.text.indexOf(
            normalisedQuery,
            searchStart
          );


        if (
          matchIndex === -1
        ) {

          break;

        }


        const normalisedEnd =
          matchIndex +
          normalisedQuery.length -
          1;


        const originalStart =
          mappedText
            .originalPositions[
          matchIndex
          ];


        const originalEndCharacter =
          mappedText
            .originalPositions[
          normalisedEnd
          ];


        searchMatches.push({

          pageIndex,

          start:
            originalStart,

          end:
            originalEndCharacter +
            1

        });


        /*
         * Move one character forward so
         * overlapping occurrences can still
         * be found.
         */

        searchStart =
          matchIndex + 1;

      }

    }
  );


  if (
    searchMatches.length > 0
  ) {

    currentSearchMatchIndex =
      0;


    showCurrentSearchMatch();

  } else {

    updateSearchControls();

  }

}


/* =========================================
   SEARCH NAVIGATION
   ========================================= */

function findNextMatch() {

  if (
    searchMatches.length === 0
  ) {

    performSearch();

    return;

  }


  currentSearchMatchIndex =
    (
      currentSearchMatchIndex +
      1
    ) %
    searchMatches.length;


  showCurrentSearchMatch();

}


function findPreviousMatch() {

  if (
    searchMatches.length === 0
  ) {

    performSearch();

    return;

  }


  currentSearchMatchIndex =
    (
      currentSearchMatchIndex -
      1 +
      searchMatches.length
    ) %
    searchMatches.length;


  showCurrentSearchMatch();

}


/* =========================================
   SHOW CURRENT SEARCH RESULT
   ========================================= */

function showCurrentSearchMatch() {

  if (
    currentSearchMatchIndex < 0 ||
    currentSearchMatchIndex >=
    searchMatches.length
  ) {

    updateSearchControls();

    return;

  }


  const match =
    searchMatches[
    currentSearchMatchIndex
    ];


  const targetPageIndex =
    match.pageIndex;


  /*
   * Search navigation is intentionally an
   * instant jump.
   *
   * PageFlip 2.0.7's turnToPage() is the
   * non-animated API for navigating directly
   * to a specified page.
   *
   * This avoids animating through every
   * intervening spread for distant results.
   */

  if (
    pageFlip &&
    !isPageCurrentlyVisible(
      targetPageIndex
    )
  ) {

    pageFlip.turnToPage(
      targetPageIndex
    );

    pageFlip.getRender().update();

  }


  updateSearchControls();


  /*
   * PageFlip must finish showing the new
   * spread before the browser can give us
   * useful text-span rectangles.
   */

  scheduleTextLayerScaleUpdate();


  scheduleSearchHighlightUpdate();

}


/* =========================================
   SEARCH CONTROL STATE
   ========================================= */

function updateSearchControls() {

  const hasQuery =
    searchInput
      .value
      .trim()
      .length > 0;


  const hasResults =
    searchMatches.length > 0;


  searchPreviousButton.disabled =
    !hasResults;


  searchNextButton.disabled =
    !hasResults;


  searchClearButton.disabled =
    !hasQuery;


  searchResultsDisplay
    .classList
    .toggle(
      "no-results",
      hasQuery &&
      !hasResults
    );


  if (
    !hasQuery
  ) {

    searchResultsDisplay
      .textContent =
      "";


    return;

  }


  if (
    !hasResults
  ) {

    searchResultsDisplay
      .textContent =
      "No results";


    return;

  }


  searchResultsDisplay
    .textContent =
    `${currentSearchMatchIndex + 1
    } of ${searchMatches.length
    }`;

}


/* =========================================
   SEARCH HIGHLIGHTING
   ========================================= */

let searchHighlightUpdatePending = false;


function scheduleSearchHighlightUpdate() {

  if (
    searchHighlightUpdatePending
  ) {

    return;

  }


  searchHighlightUpdatePending = true;


  requestAnimationFrame(
    () => {

      requestAnimationFrame(
        () => {

          searchHighlightUpdatePending = false;

          drawSearchHighlights();

        }
      );

    }
  );

}


function clearSearchHighlights() {

  document
    .querySelectorAll(
      ".search-highlight-layer"
    )
    .forEach(
      (layer) => {

        layer.replaceChildren();

      }
    );

}


/*
 * Draw all matches that belong to pages
 * currently visible in the spread.
 *
 * The active match receives the stronger
 * .current style.
 */

function drawSearchHighlights() {

  updateTextLayerScale();


  clearSearchHighlights();


  if (
    searchMatches.length === 0
  ) {

    return;

  }


  searchMatches.forEach(
    (
      match,
      matchIndex
    ) => {

      const pageElement =
        getPageElement(
          match.pageIndex
        );


      if (
        !pageElement ||
        !isElementVisible(
          pageElement
        )
      ) {

        return;

      }


      drawSingleSearchMatch(
        match,
        matchIndex ===
        currentSearchMatchIndex
      );

    }
  );

}


/* =========================================
   DRAW ONE SEARCH RESULT
   ========================================= */

function drawSingleSearchMatch(
  match,
  isCurrent
) {

  const pageData =
    pageSearchData[
    match.pageIndex
    ];


  const pageElement =
    getPageElement(
      match.pageIndex
    );


  if (
    !pageData ||
    !pageElement
  ) {

    return;

  }


  const highlightLayer =
    pageElement.querySelector(
      ".search-highlight-layer"
    );


  if (
    !highlightLayer
  ) {

    return;

  }


  const pageRect =
    pageElement
      .getBoundingClientRect();


  const layoutWidth =
    pageElement.offsetWidth;


  const layoutHeight =
    pageElement.offsetHeight;


  if (
    pageRect.width <= 0 ||
    pageRect.height <= 0 ||
    layoutWidth <= 0 ||
    layoutHeight <= 0
  ) {

    return;

  }


  /*
   * getClientRects() includes transforms from
   * PageFlip and our viewer zoom.
   *
   * The highlight elements live inside the
   * transformed page, so convert those screen
   * coordinates back into local page
   * coordinates before positioning them.
   */

  const scaleX =
    pageRect.width /
    layoutWidth;


  const scaleY =
    pageRect.height /
    layoutHeight;


  pageData.segments.forEach(
    (segment) => {

      const overlapStart =
        Math.max(
          match.start,
          segment.start
        );


      const overlapEnd =
        Math.min(
          match.end,
          segment.end
        );


      if (
        overlapStart >=
        overlapEnd
      ) {

        return;

      }


      const textNode =
        getTextNode(
          segment.span
        );


      if (
        !textNode
      ) {

        return;

      }


      const localStart =
        overlapStart -
        segment.start;


      const localEnd =
        overlapEnd -
        segment.start;


      if (
        localStart < 0 ||
        localEnd >
        textNode.length ||
        localStart >=
        localEnd
      ) {

        return;

      }


      const range =
        document.createRange();


      range.setStart(
        textNode,
        localStart
      );


      range.setEnd(
        textNode,
        localEnd
      );


      const rectangles =
        Array.from(
          range.getClientRects()
        );


      rectangles.forEach(
        (rect) => {

          if (
            rect.width <= 0 ||
            rect.height <= 0
          ) {

            return;

          }


          const highlight =
            document.createElement(
              "div"
            );


          highlight.classList.add(
            "search-highlight"
          );


          if (
            isCurrent
          ) {

            highlight.classList.add(
              "current"
            );

          }


          highlight.style.left =
            `${(
              rect.left -
              pageRect.left
            ) /
            scaleX
            }px`;


          highlight.style.top =
            `${(
              rect.top -
              pageRect.top
            ) /
            scaleY
            }px`;


          highlight.style.width =
            `${rect.width /
            scaleX
            }px`;


          highlight.style.height =
            `${rect.height /
            scaleY
            }px`;


          highlightLayer.appendChild(
            highlight
          );

        }
      );


      range.detach();

    }
  );

}


/* =========================================
   SEARCH HELPERS
   ========================================= */

function getTextNode(
  element
) {

  for (
    const node of
    element.childNodes
  ) {

    if (
      node.nodeType ===
      Node.TEXT_NODE
    ) {

      return node;

    }

  }


  return null;

}


function getPageElement(
  pageIndex
) {

  return book.querySelector(
    `.pdf-page[data-page-index="${pageIndex}"]`
  );

}


function isElementVisible(
  element
) {

  if (
    getComputedStyle(
      element
    ).display ===
    "none"
  ) {

    return false;

  }


  const rect =
    element
      .getBoundingClientRect();


  return (
    rect.width > 0 &&
    rect.height > 0
  );

}


function isPageCurrentlyVisible(
  pageIndex
) {

  const pageElement =
    getPageElement(
      pageIndex
    );


  if (
    !pageElement
  ) {

    return false;

  }


  return isElementVisible(
    pageElement
  );

}


/* =========================================
   CLEAR SEARCH
   ========================================= */

function clearSearch() {

  searchInput.value =
    "";


  activeSearchQuery =
    "";


  searchMatches =
    [];


  currentSearchMatchIndex =
    -1;


  clearSearchHighlights();


  updateSearchControls();


  searchInput.focus();

}


/* =========================================
   COVER POSITION / SPREAD STATE
   ========================================= */

function updateCoverPosition() {

  if (
    !pdfDocument ||
    !bookWrapper
  ) {

    return;

  }


  const totalPages =
    pdfDocument.numPages;


  const isFrontCover =
    currentPageIndex === 0;


  const isBackCover =
    currentPageIndex ===
    totalPages - 1;


  const isOpenSpread =
    !isFrontCover &&
    !isBackCover;


  bookWrapper
    .classList
    .toggle(
      "open-spread",
      isOpenSpread
    );


  /*
   * Preserve the existing working cover
   * centring calculation.
   */

  const coverShift =
    pageFlip.getOrientation() === "portrait"
      ? 0
      : pageFlip.getBoundsRect().pageWidth / 2;


  if (
    isFrontCover
  ) {

    bookWrapper.style.setProperty(
      "--cover-shift",
      `${-coverShift}px`
    );

  } else if (
    isBackCover
  ) {

    bookWrapper.style.setProperty(
      "--cover-shift",
      `${coverShift}px`
    );

  } else {

    bookWrapper.style.setProperty(
      "--cover-shift",
      "0px"
    );

  }

}


/* =========================================
   PAGE INDICATOR
   ========================================= */

function updatePageIndicator(
  pageIndex
) {

  const totalPages =
    pdfDocument.numPages;


  /*
   * PageFlip uses zero-based page indexes.
   *
   * The page field uses normal PDF page
   * numbers beginning at 1.
   */

  let pdfPage =
    pageIndex + 1;


  /*
   * Keep the displayed page within the
   * actual PDF page range.
   */

  pdfPage =
    Math.max(
      1,
      Math.min(
        totalPages,
        pdfPage
      )
    );


  pageNumberInput.value =
    pdfPage;


  pageNumberInput.maxLength =
    String(
      totalPages
    ).length;


  /*
   * Front cover.
   */

  if (
    pdfPage === 1
  ) {

    previousButton.disabled =
      true;


    nextButton.disabled =
      totalPages <= 1;


    return;

  }


  /*
   * Back cover.
   */

  if (
    pdfPage ===
    totalPages
  ) {

    previousButton.disabled =
      false;


    nextButton.disabled =
      true;


    return;

  }


  /*
   * Normal two-page spread.
   */

  previousButton.disabled =
    false;


  nextButton.disabled =
    false;

}

/* =========================================
   JUMP TO PAGE
   ========================================= */

function jumpToPage() {

  if (
    !pageFlip ||
    !pdfDocument
  ) {

    return;

  }


  const requestedPage =
    Number.parseInt(
      pageNumberInput.value,
      10
    );


  const totalPages =
    pdfDocument.numPages;


  /*
   * Reject invalid page numbers and restore
   * the field to the actual current page.
   */

  if (
    !Number.isInteger(
      requestedPage
    ) ||
    requestedPage < 1 ||
    requestedPage > totalPages
  ) {

    updatePageIndicator(
      currentPageIndex
    );


    return;

  }


  /*
   * Convert the PDF page number to PageFlip's
   * zero-based page index.
   */

  let targetPageIndex =
    requestedPage - 1;


  /*
   * Interior pages are displayed as spreads.
   *
   * If the requested page is the right-hand
   * page of a spread, navigate to the
   * beginning of that same spread.
   *
   * Example:
   *
   * Page 4 -> index 3
   * Page 5 -> also index 3
   */

  if (
    requestedPage > 1 &&
    requestedPage < totalPages &&
    requestedPage % 2 !== 0
  ) {

    targetPageIndex =
      requestedPage - 2;

  }


  /*
   * Jump directly to the requested spread.
   */

  pageFlip.turnToPage(
    targetPageIndex
  );

  pageFlip.getRender().update();

}

/* =========================================
   BOOK TRANSFORM
   ========================================= */

function updateBookTransform() {

  /*
   * #book remains responsible only for
   * zoom and pan.
   *
   * Cover centring remains on
   * .book-wrapper.
   */

  book.style.transform =
    `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;


  book.style.transformOrigin =
    "top center";

}


/* =========================================
   PAN LIMITS
   ========================================= */

function constrainPan() {

  if (
    zoomLevel <= 1
  ) {

    panX = 0;

    panY = 0;

    return;

  }


  const bookWidth =
    book.offsetWidth;


  const bookHeight =
    book.offsetHeight;


  const extraWidth =
    bookWidth *
    (
      zoomLevel - 1
    );


  const extraHeight =
    bookHeight *
    (
      zoomLevel - 1
    );


  const maxPanX =
    extraWidth / 2;


  const maxPanY =
    extraHeight;


  panX =
    Math.max(
      -maxPanX,
      Math.min(
        maxPanX,
        panX
      )
    );


  panY =
    Math.max(
      -maxPanY,
      Math.min(
        0,
        panY
      )
    );

}


/* =========================================
   ZOOM FUNCTIONS
   ========================================= */

function updateZoom() {

  constrainPan();


  updateBookTransform();


  zoomDisplay.textContent =
    `${Math.round(
      zoomLevel * 100
    )
    }%`;


  zoomOutButton.disabled =
    zoomLevel <=
    minimumZoom;


  zoomInButton.disabled =
    zoomLevel >=
    maximumZoom;


  bookViewport
    .classList
    .toggle(
      "zoomed-in",
      zoomLevel > 1
    );


  /*
   * Search rectangles are screen-geometry
   * based, so redraw after zoom changes.
   */

  scheduleSearchHighlightUpdate();

}


function zoomIn() {

  zoomLevel =
    Math.min(
      maximumZoom,
      zoomLevel +
      zoomStep
    );


  updateZoom();

}


function zoomOut() {

  zoomLevel =
    Math.max(
      minimumZoom,
      zoomLevel -
      zoomStep
    );


  updateZoom();

}


function resetZoom() {

  zoomLevel = 1;


  panX = 0;

  panY = 0;


  updateZoom();

}


/* =========================================
   INTERACTION TOOLS
   ========================================= */

function isTextInteractionTarget(
  target
) {

  if (
    !(
      target instanceof
      Element
    )
  ) {

    return false;
  }


  return Boolean(
    target.closest(
      ".textLayer span"
    )
  );
}


/*
 * Update the active Select/Hand tool.
 *
 * Changing tools does not change zoom.
 */

function setInteractionTool(
  tool
) {

  if (
    tool !== "select" &&
    tool !== "hand"
  ) {

    return;
  }


  activeTool =
    tool;


  const selectIsActive =
    activeTool ===
    "select";


  const handIsActive =
    activeTool ===
    "hand";


  selectToolButton
    .classList
    .toggle(
      "is-active",
      selectIsActive
    );


  handToolButton
    .classList
    .toggle(
      "is-active",
      handIsActive
    );


  selectToolButton
    .setAttribute(
      "aria-pressed",
      String(
        selectIsActive
      )
    );


  handToolButton
    .setAttribute(
      "aria-pressed",
      String(
        handIsActive
      )
    );


  bookViewport
    .classList
    .toggle(
      "tool-select",
      selectIsActive
    );


  bookViewport
    .classList
    .toggle(
      "tool-hand",
      handIsActive
    );
}


/*
 * PageFlip 2.0.7 listens for mousedown on
 * its display element and calls
 * preventDefault().
 *
 * This capture-phase listener gets there
 * first.
 *
 * SELECT:
 *
 * - text remains selectable
 * - normal page dragging remains available
 *   at 100% or below
 * - while zoomed above 100%, dragging does
 *   not accidentally turn the page
 *
 * HAND:
 *
 * - PageFlip dragging is disabled
 * - the pointer can instead be used for pan
 */

book.addEventListener(
  "mousedown",
  (event) => {

    if (
      event.target.closest(".pdf-link")
    ) {

      event.stopPropagation();

      return;

    }

    if (
      activeTool ===
      "hand" &&
      zoomLevel > 1
    ) {

      event.stopPropagation();

      return;
    }


    if (
      activeTool ===
      "select" &&
      (
        isTextInteractionTarget(
          event.target
        ) ||
        zoomLevel > 1
      )
    ) {

      event.stopPropagation();
    }

  },
  true
);


/*
 * PageFlip also listens for touchstart.
 *
 * Apply the same routing without calling
 * preventDefault(), so Select mode does not
 * interfere with native text interaction.
 */

book.addEventListener(
  "touchstart",
  (event) => {

    if (
      event.target.closest(".pdf-link")
    ) {

      event.stopPropagation();

      return;

    }

    if (
      activeTool ===
      "hand" &&
      zoomLevel > 1
    ) {

      event.stopPropagation();

      return;
    }


    if (
      activeTool ===
      "select" &&
      (
        isTextInteractionTarget(
          event.target
        ) ||
        zoomLevel > 1
      )
    ) {

      event.stopPropagation();
    }

  },
  true
);


/* =========================================
   HAND TOOL PANNING
   ========================================= */

bookViewport.addEventListener(
  "pointerdown",
  (event) => {

    /*
     * Panning belongs exclusively to the
     * Hand tool.
     */

    if (
      activeTool !==
      "hand"
    ) {

      return;
    }


    /*
     * There is nothing to pan when the book
     * is at 100% or smaller.
     */

    if (
      zoomLevel <= 1
    ) {

      return;
    }


    /*
     * Mouse panning uses the primary button.
     * Touch and pen pointers are unaffected
     * by this check.
     */

    if (
      event.pointerType ===
      "mouse" &&
      event.button !== 0
    ) {

      return;
    }


    event.preventDefault();


    isPanning =
      true;


    panStartX =
      event.clientX;


    panStartY =
      event.clientY;


    panStartOffsetX =
      panX;


    panStartOffsetY =
      panY;


    bookViewport
      .setPointerCapture(
        event.pointerId
      );


    bookViewport
      .classList
      .add(
        "is-panning"
      );
  }
);


bookViewport.addEventListener(
  "pointermove",
  (event) => {

    if (
      !isPanning
    ) {

      return;
    }


    const movementX =
      event.clientX -
      panStartX;


    const movementY =
      event.clientY -
      panStartY;


    panX =
      panStartOffsetX +
      movementX;


    panY =
      panStartOffsetY +
      movementY;


    constrainPan();


    updateBookTransform();
  }
);


function stopPanning(
  event
) {

  if (
    !isPanning
  ) {

    return;
  }


  isPanning =
    false;


  if (
    bookViewport
      .hasPointerCapture(
        event.pointerId
      )
  ) {

    bookViewport
      .releasePointerCapture(
        event.pointerId
      );
  }


  bookViewport
    .classList
    .remove(
      "is-panning"
    );
}


bookViewport.addEventListener(
  "pointerup",
  stopPanning
);


bookViewport.addEventListener(
  "pointercancel",
  stopPanning
);

/* =========================================
   WINDOW RESIZE
   ========================================= */

window.addEventListener(
  "resize",
  () => {

    if (
      !pageFlip
    ) {

      return;

    }


    updateAvailableBookSize();


    requestAnimationFrame(
      () => {

        requestAnimationFrame(
          () => {

            updateCoverPosition();


            updateTextLayerScale();


            drawSearchHighlights();

          }
        );

      }
    );

  }
);



/* =========================================
   PAGE CONTROLS
   ========================================= */

nextButton.addEventListener(
  "click",
  () => {

    if (
      !pageFlip
    ) {

      return;

    }


    /*
     * Preserve the existing successful
     * front-cover opening correction.
     */

    if (
      currentPageIndex === 0
    ) {

      bookWrapper
        .style
        .setProperty(
          "--cover-shift",
          "0px"
        );

    }


    pageFlip.flipNext();

  }
);


previousButton.addEventListener(
  "click",
  () => {

    if (
      !pageFlip
    ) {

      return;

    }


    /*
     * Preserve the existing successful
     * back-cover correction.
     */

    if (
      currentPageIndex ===
      pdfDocument.numPages - 1
    ) {

      bookWrapper
        .style
        .setProperty(
          "--cover-shift",
          "0px"
        );

    }


    pageFlip.flipPrev();

  }
);

/* =========================================
   PAGE NUMBER CONTROL
   ========================================= */

pageNumberInput.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key !==
      "Enter"
    ) {

      return;

    }


    event.preventDefault();


    jumpToPage();


    pageNumberInput.blur();

  }
);


/*
 * If the user leaves the field without
 * navigating, restore the actual current
 * page number.
 */

pageNumberInput.addEventListener(
  "blur",
  () => {

    updatePageIndicator(
      currentPageIndex
    );

  }
);

/* =========================================
   KEYBOARD PAGE NAVIGATION
   ========================================= */

document.addEventListener(
  "keydown",
  (event) => {

    /*
     * Do not intercept keyboard input while
     * the user is typing in a form control.
     */

    const target =
      event.target;

    if (
      target instanceof
      HTMLInputElement ||
      target instanceof
      HTMLTextAreaElement ||
      target instanceof
      HTMLSelectElement
    ) {

      return;

    }



    /*
     * Right Arrow = next page/spread.
     */

    if (
      event.key ===
      "ArrowRight"
    ) {

      if (
        !nextButton.disabled
      ) {

        event.preventDefault();

        nextButton.click();

      }

      return;

    }


    /*
     * Left Arrow = previous page/spread.
     */

    if (
      event.key ===
      "ArrowLeft"
    ) {

      if (
        !previousButton.disabled
      ) {

        event.preventDefault();

        previousButton.click();

      }

    }

  }
);

/* =========================================
   ZOOM CONTROLS
   ========================================= */

zoomInButton.addEventListener(
  "click",
  zoomIn
);


zoomOutButton.addEventListener(
  "click",
  zoomOut
);


zoomResetButton.addEventListener(
  "click",
  resetZoom
);

/* =========================================
   INTERACTION TOOL CONTROLS
   ========================================= */

selectToolButton.addEventListener(
  "click",
  () => {

    setInteractionTool(
      "select"
    );
  }
);


handToolButton.addEventListener(
  "click",
  () => {

    setInteractionTool(
      "hand"
    );
  }
);

/* =========================================
   SEARCH CONTROLS
   ========================================= */

/*
 * Typing changes the query.
 *
 * We wait for Enter before executing the
 * search so the viewer isn't jumping pages
 * while the user is still typing.
 */

searchButton.addEventListener("click", () => {
  performSearch();
});


searchInput.addEventListener(
  "input",
  () => {

    const value =
      searchInput
        .value
        .trim();


    searchClearButton.disabled =
      value.length === 0;


    /*
     * Once the text differs from the active
     * search, the old results no longer
     * describe what's in the field.
     */

    if (
      value !==
      activeSearchQuery
    ) {

      searchMatches =
        [];


      currentSearchMatchIndex =
        -1;


      clearSearchHighlights();


      searchPreviousButton.disabled =
        true;


      searchNextButton.disabled =
        true;


      searchResultsDisplay
        .textContent =
        "";


      searchResultsDisplay
        .classList
        .remove(
          "no-results"
        );

    }

  }
);


searchInput.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key !==
      "Enter"
    ) {

      return;

    }


    event.preventDefault();


    const currentQuery =
      searchInput
        .value
        .trim();


    /*
     * A changed query starts a completely
     * new search.
     */

    if (
      currentQuery !==
      activeSearchQuery ||
      searchMatches.length === 0
    ) {

      performSearch();

      return;

    }


    /*
     * Once a search is active:
     *
     * Enter         = next result
     * Shift + Enter = previous result
     */

    if (
      event.shiftKey
    ) {

      findPreviousMatch();

    } else {

      findNextMatch();

    }

  }
);


searchNextButton.addEventListener(
  "click",
  findNextMatch
);


searchPreviousButton.addEventListener(
  "click",
  findPreviousMatch
);


searchClearButton.addEventListener(
  "click",
  clearSearch
);


/* =========================================
   START
   ========================================= */

setInteractionTool(
  "select"
);


updateZoom();


updateSearchControls();


loadPDF();