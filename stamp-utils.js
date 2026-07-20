// ============================================
// STANDALONE STAMP UTILITY
// Uses ONLY the stamp design you provided
// ============================================

var StampUtils = (function() {
    'use strict';

    // ============================================
    // STAMP CONFIGURATION (Your Design)
    // ============================================
    var config = {
        councilName: 'MANYAME RURAL DISTRICT COUNCIL',
        title: 'DISTRICT PLANNER',
        address: 'P.O. BOX 99, BEATRICE',
        phone: 'TEL: 0242150-239/218',
        primaryColor: '#1e3c72',
        secondaryColor: '#2a5298'
    };

    // ============================================
    // PUBLIC FUNCTIONS
    // ============================================

    /**
     * Get formatted date for stamp
     * @param {Date} date - Optional date object (defaults to now)
     * @returns {string} Formatted date (e.g., "25 NOVEMBER 2026")
     */
    function getStampDate(date) {
        var d = date || new Date();
        return d.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }).toUpperCase();
    }

    /**
     * Generate stamp HTML (Your exact design)
     * @param {object} options - Optional overrides
     * @param {string} options.title - Custom title (default: 'DISTRICT PLANNER')
     * @param {string} options.date - Custom date (default: current date)
     * @returns {string} HTML for the stamp
     */
    function generateStampHTML(options) {
        var opts = options || {};
        
        var title = opts.title || config.title;
        var date = opts.date || getStampDate();
        var councilName = opts.councilName || config.councilName;
        var address = opts.address || config.address;
        var phone = opts.phone || config.phone;
        var primaryColor = opts.primaryColor || config.primaryColor;
        var secondaryColor = opts.secondaryColor || config.secondaryColor;

        return `
        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd; text-align: right;">
            <div style="
                border: 2px solid ${primaryColor};
                border-radius: 4px;
                padding: 10px 16px;
                display: inline-block;
                text-align: center;
                background: white;
                min-width: 190px;
            ">
                <div style="
                    font-size: 10pt;
                    font-weight: bold;
                    color: ${primaryColor};
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 2px;
                ">
                    ${councilName}
                </div>
                <div style="
                    font-size: 9.5pt;
                    font-weight: bold;
                    color: ${secondaryColor};
                    text-transform: uppercase;
                    margin-bottom: 3px;
                    border-bottom: 1px solid ${primaryColor};
                    padding-bottom: 3px;
                ">
                    ${title}
                </div>
                <div style="
                    font-size: 10pt;
                    font-weight: bold;
                    color: ${secondaryColor};
                    margin: 3px 0;
                    letter-spacing: 1px;
                ">
                    ${date}
                </div>
                <div style="
                    font-size: 7.5pt;
                    color: ${primaryColor};
                    margin-top: 3px;
                    padding-top: 3px;
                    border-top: 1px solid #ddd;
                ">
                    ${address}
                    <br>
                    ${phone}
                </div>
            </div>
        </div>
        `;
    }

    /**
     * Generate stamp CSS (Your exact design)
     * @returns {string} CSS styles for stamp
     */
    function generateStampCSS() {
        var pColor = config.primaryColor;
        var sColor = config.secondaryColor;
        
        return `
        .stamp-wrapper {
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
            text-align: right;
        }
        .stamp-box {
            border: 2px solid ${pColor};
            border-radius: 4px;
            padding: 10px 16px;
            display: inline-block;
            text-align: center;
            background: white;
            min-width: 190px;
        }
        .stamp-title {
            font-size: 10pt;
            font-weight: bold;
            color: ${pColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .stamp-subtitle {
            font-size: 9.5pt;
            font-weight: bold;
            color: ${sColor};
            text-transform: uppercase;
            margin-bottom: 3px;
            border-bottom: 1px solid ${pColor};
            padding-bottom: 3px;
        }
        .stamp-date {
            font-size: 10pt;
            font-weight: bold;
            color: ${sColor};
            margin: 3px 0;
            letter-spacing: 1px;
        }
        .stamp-address {
            font-size: 7.5pt;
            color: ${pColor};
            margin-top: 3px;
            padding-top: 3px;
            border-top: 1px solid #ddd;
        }
        `;
    }

    /**
     * Generate stamp CSS as a <style> tag
     * @returns {string} Style tag with stamp CSS
     */
    function generateStampStyleTag() {
        return '<style>' + generateStampCSS() + '</style>';
    }

    /**
     * Check if stamp should be applied
     * @param {object} data - Document data
     * @param {string} approvalField - Field that indicates approval (default: 'ceo_approved')
     * @returns {boolean} True if stamp should be applied
     */
    function shouldApplyStamp(data, approvalField) {
        var field = approvalField || 'ceo_approved';
        return !!(data && data[field]);
    }

    /**
     * Apply stamp to HTML
     * @param {string} html - HTML content
     * @param {object} options - Stamp options
     * @param {string} placeholder - Optional placeholder to replace
     * @returns {string} HTML with stamp applied
     */
    function applyStampToHtml(html, options, placeholder) {
        var stampHtml = generateStampHTML(options);
        var stampCss = generateStampCSS();
        
        // Add CSS if not already present
        if (!html.includes('.stamp-box')) {
            html = html.replace('</style>', stampCss + '\n</style>');
        }
        
        // Replace placeholder if provided
        if (placeholder) {
            html = html.replace(placeholder, stampHtml);
        } 
        // Or find and replace stamp placeholder
        else if (html.includes('<!-- STAMP_PLACEHOLDER -->')) {
            html = html.replace(
                '<!-- STAMP_PLACEHOLDER -->',
                '<!-- STAMP_PLACEHOLDER -->\n' + stampHtml + '\n<!-- END_STAMP -->'
            );
        }
        // Or append before </body>
        else if (html.includes('</body>')) {
            html = html.replace('</body>', stampHtml + '\n</body>');
        }
        // Or append to end
        else {
            html = html + stampHtml;
        }
        
        return html;
    }

    // ============================================
    // EXPOSE PUBLIC API
    // ============================================

    return {
        getStampDate: getStampDate,
        generateStampHTML: generateStampHTML,
        generateStampCSS: generateStampCSS,
        generateStampStyleTag: generateStampStyleTag,
        shouldApplyStamp: shouldApplyStamp,
        applyStampToHtml: applyStampToHtml,
        config: config
    };

})();

// ============================================
// EXPORT FOR DIFFERENT ENVIRONMENTS
// ============================================

// For browser (global)
if (typeof window !== 'undefined') {
    window.StampUtils = StampUtils;
}

// For Node.js (if used)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StampUtils;
}
