/*
 * Custom GA4 event tracking.
 *
 * IMPORTANT: this site loads gtag.js, not Google Tag Manager. Events must be sent
 * with gtag('event', name, params). Pushing {event: '...'} objects onto
 * window.dataLayer is GTM syntax and gtag.js silently discards it — that is what
 * the previous version of this file did, so none of it ever reached GA4.
 */
(function () {
  'use strict';

  // gtag() is defined inline in each page's <head>. Missing means the tag was blocked.
  function track(name, params) {
    if (typeof window.gtag !== 'function') return;
    window.gtag('event', name, params || {});
  }

  // GA4 drops string parameter values longer than 100 characters.
  function clean(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').slice(0, 100);
  }

  // The literal href, not the resolved .href property — mailto:, #hash and relative
  // paths are more useful in reports than the absolute URL the browser expands them to.
  function hrefOf(el) {
    return el.getAttribute('href') || '';
  }

  // Nearest section id, so every interaction says where on the page it happened.
  function locationOf(el) {
    var section = el.closest('section[id]');
    return section ? section.id : 'header';
  }

  // Every page that loads this file also loads pages where some of these selectors
  // match nothing (portfolio-details.html, 404.html); an empty NodeList is a no-op.
  function onClick(selector, handler) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('click', handler);
    });
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {

    // Track navigation clicks
    onClick('#navbar .nav-link', function () {
      track('navigation_click', {
        nav_item: clean(this.textContent),
        nav_target: clean(hrefOf(this))
      });
    });

    // Track social media clicks (the resume link shares this container, so skip downloads)
    onClick('.social-links a:not([download])', function () {
      var host = '';
      try {
        host = new URL(this.href, window.location.href).hostname.replace(/^www\./, '');
      } catch (e) { /* relative or malformed href */ }

      track('social_click', {
        social_platform: clean(this.className) || host || 'unknown',
        social_url: clean(this.href),
        click_location: locationOf(this)
      });
    });

    // Track portfolio filter clicks
    onClick('#portfolio-flters li', function () {
      var value = this.getAttribute('data-filter') || '';
      track('portfolio_filter', {
        filter_category: value === '*' ? 'all' : clean(value.replace('.filter-', ''))
      });
    });

    // Track portfolio item clicks
    onClick('.portfolio-links a', function () {
      var item = this.closest('.portfolio-item');
      var heading = item && item.querySelector('h4');
      var category = item && item.className.match(/filter-([\w-]+)/);

      track('portfolio_click', {
        // The h4, not the anchor's title attribute — those hold full paragraphs.
        portfolio_title: heading ? clean(heading.textContent) : 'unknown',
        portfolio_category: category ? category[1] : 'unknown',
        click_type: this.classList.contains('portfolio-lightbox') ? 'preview' : 'project_link',
        link_destination: clean(hrefOf(this))
      });
    });

    // Track resume downloads — a key event
    onClick('a[href$=".pdf"]', function () {
      track('resume_download', {
        file_name: clean(hrefOf(this).split('/').pop()),
        download_location: locationOf(this)
      });
    });

    // Track email clicks — the primary conversion, since the contact form is disabled
    onClick('a[href^="mailto:"]', function () {
      track('email_click', {
        email_target: clean(hrefOf(this).replace('mailto:', '')),
        click_location: locationOf(this)
      });
    });

    // This template is a tabbed single-page app: every section is absolutely
    // positioned and hidden, and main.js reveals exactly one at a time by adding
    // .section-show. Nothing navigates, so GA4 would otherwise record a single
    // page_view for the whole visit. Treating each reveal as a virtual page_view
    // makes About / Resume / Portfolio / Contact show up as real rows in the
    // standard "Pages and screens" report, with their own engagement time.
    var sections = document.querySelectorAll('section[id]');

    // Both live out here because the scroll tracking below needs them even on pages
    // with no sections at all (portfolio-details.html), where current stays null.
    var current = null;
    var reached = {};

    if (sections.length) {
      // The hero counts as a screen too — it is what visitors land on.
      var HOME = 'home';
      var enteredAt = performance.now();

      // Seed from the hash when there is one: gtag's automatic page_view already
      // carries it, so treating that section as current avoids sending a duplicate
      // when main.js reveals it 350ms later. Otherwise seed from whatever is already
      // visible — 404.html ships with its section shown in the markup, so no
      // mutation ever fires there and the dwell time would be filed under 'home'.
      current = (window.location.hash || '').replace('#', '') || visibleSectionId();

      // Reuse the nav's own wording so labels track the site if it is renamed.
      function labelFor(name) {
        if (name === HOME) return 'Home';
        var link = document.querySelector('#navbar .nav-link[href="#' + name + '"]');
        return link ? clean(link.textContent) : name.charAt(0).toUpperCase() + name.slice(1);
      }

      // Restarts the clock as well as reporting it: leaving a page fires both
      // visibilitychange and pagehide, and a backgrounded tab that comes back would
      // otherwise count the whole time it spent hidden.
      function flushSectionTime() {
        var now = performance.now();
        var seconds = Math.round((now - enteredAt) / 1000);
        enteredAt = now;

        if (seconds >= 1) {
          track('section_time', {
            section_name: current,
            section_title: labelFor(current),
            engagement_seconds: seconds
          });
        }
      }

      function visibleSectionId() {
        for (var i = 0; i < sections.length; i++) {
          if (sections[i].classList.contains('section-show')) return sections[i].id;
        }
        return HOME;
      }

      function onSectionChange() {
        var next = visibleSectionId();
        if (next === current) return;

        flushSectionTime();
        current = next;
        reached = {}; // each section scrolls independently

        var pageLocation = window.location.origin + window.location.pathname +
          (next === HOME ? '' : '#' + next);

        track('page_view', {
          page_title: labelFor(next) + ' | Chaira Harder',
          page_location: pageLocation
        });
        track('section_view', { section_name: next, section_title: labelFor(next) });
      }

      // main.js toggles .section-show on a 350ms timer, so watch the attribute
      // rather than the nav click — this also catches #hash deep links on load.
      var sectionCheckQueued = false;
      new MutationObserver(function () {
        if (sectionCheckQueued) return;
        sectionCheckQueued = true;
        window.requestAnimationFrame(function () {
          sectionCheckQueued = false;
          onSectionChange();
        });
      }).observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });

      window.addEventListener('pagehide', flushSectionTime);
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') flushSectionTime();
      });
    }

    // Track scroll depth. GA4's built-in scroll event only fires once, at 90%,
    // and here it is near-useless: the landing view does not scroll at all, and
    // the counter has to reset every time a new section is revealed.
    var milestones = [25, 50, 75, 90];
    var scrollCheckQueued = false;

    function checkScrollDepth() {
      scrollCheckQueued = false;
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;

      var percent = ((window.scrollY || doc.scrollTop) / scrollable) * 100;
      milestones.forEach(function (milestone) {
        if (percent >= milestone && !reached[milestone]) {
          reached[milestone] = true;
          track('scroll_depth', {
            percent_scrolled: milestone,
            section_name: current || 'unknown'
          });
        }
      });
    }

    window.addEventListener('scroll', function () {
      if (scrollCheckQueued) return;
      scrollCheckQueued = true;
      window.requestAnimationFrame(checkScrollDepth);
    }, { passive: true });

    // Track which broken URLs people actually land on. GitHub Pages serves 404.html
    // while keeping the requested path in the address bar, so this is the real path.
    if (document.body.getAttribute('data-page-type') === '404') {
      track('page_not_found', {
        not_found_path: clean(window.location.pathname + window.location.search),
        not_found_referrer: clean(document.referrer) || 'direct'
      });
    }

  });
})();
