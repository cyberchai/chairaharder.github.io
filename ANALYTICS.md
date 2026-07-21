# Analytics setup

Everything on the code side is done. This file covers the parts that have to be
configured in the Google Analytics UI, plus what each event means.

**Property:** GA4, measurement ID `G-Q7Q0FR57TJ`
**Tracking code:** `assets/js/analytics.js`, loaded on `index.html`, `portfolio-details.html`, `404.html`

---

## Background: what was broken

The previous version of `analytics.js` sent events with `dataLayer.push({event: '...'})`.
That is **Google Tag Manager** syntax. This site loads **gtag.js**, which ignores those
objects entirely — so every custom event was silently discarded and never reached GA4.
Only the automatic events (`page_view`, `scroll`, `click`, `file_download`) were ever
recorded.

Events are now sent with `gtag('event', name, params)`, which is the correct call for
gtag.js. This was verified against the live property by watching the network requests
to `google-analytics.com/g/collect`.

---

## 1. Register custom dimensions (required)

**This is the step people skip, and without it the new data is invisible.** GA4 collects
event parameters but will not show them in any report until each one is registered as a
custom dimension. Do this before you start looking for data.

Go to **Admin → Data display → Custom definitions → Create custom dimension**.
Scope is **Event** for all of them.

| Dimension name | Event parameter | Why you want it |
|---|---|---|
| Section name | `section_name` | Which tab was open |
| Section title | `section_title` | Human-readable version of the above |
| Nav item | `nav_item` | Which nav link was clicked |
| Portfolio title | `portfolio_title` | **Which specific projects get clicked** |
| Portfolio category | `portfolio_category` | AI/ML vs iOS vs Web vs Data |
| Click type | `click_type` | `preview` (lightbox) vs `project_link` (GitHub/live site) |
| Link destination | `link_destination` | Where a project click went |
| Filter category | `filter_category` | Which portfolio filter was used |
| Social platform | `social_platform` | GitHub vs LinkedIn vs Instagram |
| Click location | `click_location` | Which section the click happened in |
| Download location | `download_location` | Where the resume was downloaded from |
| File name | `file_name` | Which resume version |
| Email target | `email_target` | Which of the two addresses was clicked |
| Not found path | `not_found_path` | **Which broken URLs people actually hit** |
| Not found referrer | `not_found_referrer` | What linked to the broken URL |

There is also one **metric** worth registering
(**Custom definitions → Custom metrics → Create custom metric**):

| Metric name | Event parameter | Unit |
|---|---|---|
| Engagement seconds | `engagement_seconds` | Standard |

> GA4 caps you at 50 event-scoped custom dimensions, so there is plenty of headroom.
> Custom dimensions are **not retroactive** — they only apply to data collected after
> you create them. Create them now even if you are not ready to build reports.

---

## 2. Mark key events (conversions)

**Admin → Data display → Events**, toggle "Mark as key event" on:

- `email_click` — the real conversion. The contact form is commented out in
  `index.html`, so a mailto click is the only way someone starts a conversation.
- `resume_download` — the other thing you actually want visitors to do.

Optionally also `portfolio_click` if you care about project interest as a goal.

---

## 3. Turn on the useful toggles

**Admin → Data streams → your web stream:**

- **Enhanced measurement** — already on. Leave it on; it gives you outbound clicks and
  `file_download` for free. Note its built-in `scroll` event only fires once at 90% and
  is largely redundant now that `scroll_depth` exists.
- **Define internal traffic** (under *Configure tag settings → Show all → Define internal
  traffic*) — add your own IP so your own visits stop polluting the data. Then go to
  **Admin → Data settings → Data filters** and switch the "Internal Traffic" filter from
  *Testing* to **Active**. It is created in testing mode by default and does nothing until
  you activate it.
- **Data retention** — **Admin → Data settings → Data retention**, change from 2 months to
  **14 months**. It defaults to the shortest option and you cannot recover data you
  already discarded. Do this first, it takes ten seconds.

---

## 4. Verifying it works

**Admin → DebugView** shows events in real time from a debug-enabled browser.

Easiest way to enable debug mode: install the
[Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna)
Chrome extension and toggle it on.

Or without an extension — open DevTools on the site and run:

```js
gtag('config', 'G-Q7Q0FR57TJ', { debug_mode: true });
```

Then click around. Events appear in DebugView within a few seconds.

To confirm without DebugView, open the **Network** tab, filter for `collect`, and look at
the request payloads. Custom events are batched into the POST body, so check the body and
not just the URL — a request with no `en=` in the query string usually holds several
events in its body.

---

## 5. Reports worth building

### Which sections do people actually look at?
Because each section reveal now fires a virtual `page_view`, this works in the standard
report with no setup: **Reports → Engagement → Pages and screens**. You will see rows for
`/index.html#about`, `/index.html#resume`, `/index.html#portfolio`, `/index.html#contact`,
with their own views and average engagement time.

This is the single biggest change. Before, the whole site was one row.

### Which projects get clicked?
**Explore → Free form**
- Dimension: `Portfolio title`
- Metric: `Event count`
- Filter: `Event name` exactly matches `portfolio_click`

Add `Click type` as a second dimension to separate people who opened the preview from
people who clicked through to GitHub or the live site.

### Do recruiters read the resume section before downloading?
**Explore → Funnel exploration**, steps:
1. `page_view` where `Section name` = `resume`
2. `resume_download`
3. `email_click`

### What broken links are people hitting?
**Explore → Free form**
- Dimensions: `Not found path`, `Not found referrer`
- Metric: `Event count`
- Filter: `Event name` exactly matches `page_not_found`

Worth checking monthly — it tells you which dead URLs are still being linked to, which is
the cheapest SEO fix there is.

---

## 6. Event reference

Everything `analytics.js` sends.

| Event | Parameters | Fires when |
|---|---|---|
| `page_view` | `page_title`, `page_location` | A section tab is revealed (virtual pageview) |
| `section_view` | `section_name`, `section_title` | Same moment, as a distinct event |
| `section_time` | `section_name`, `section_title`, `engagement_seconds` | Leaving a section, or hiding/closing the tab |
| `scroll_depth` | `percent_scrolled` (25/50/75/90), `section_name` | Scrolling within a section; resets per section |
| `navigation_click` | `nav_item`, `nav_target` | A top nav link is clicked |
| `portfolio_click` | `portfolio_title`, `portfolio_category`, `click_type`, `link_destination` | A project preview or project link is clicked |
| `portfolio_filter` | `filter_category` | A portfolio filter is clicked |
| `social_click` | `social_platform`, `social_url`, `click_location` | A social icon is clicked |
| `resume_download` | `file_name`, `download_location` | Any `.pdf` link is clicked |
| `email_click` | `email_target`, `click_location` | Any `mailto:` link is clicked |
| `page_not_found` | `not_found_path`, `not_found_referrer` | The 404 page loads |

### A note on the site's structure

The template is a **tabbed single-page app**, not a scrolling page. Every `<section>` is
absolutely positioned and hidden; `assets/js/main.js` reveals exactly one at a time by
adding a `.section-show` class. Nothing ever navigates.

That is why `analytics.js` watches for that class change with a `MutationObserver` rather
than using scroll position or an `IntersectionObserver`, and why it sends virtual
pageviews. It also means scroll-depth tracking has to reset each time a new section opens,
since each section scrolls independently.

If you ever restructure the site into real pages, this section-tracking block is the part
to revisit.

---

## 7. Still worth adding (not done)

These need accounts, so they were left out of the code changes:

1. **Google Search Console** — the highest-value missing piece. It is the only place you
   can see what people searched to find you, your impressions, and your click-through
   rate. GA4 cannot show you this. Verify via DNS or by adding a meta tag to
   `index.html`, then submit `https://chairaharder.com/sitemap.xml`.
2. **Microsoft Clarity** — free, unlimited session recordings and click/scroll heatmaps,
   and it links to GA4. One script tag. Best value for "what are people actually doing."
3. **Cloudflare Web Analytics** — free and cookieless. Worth it because a developer and
   recruiter audience blocks `google-analytics.com` heavily; GA4 is likely undercounting
   real traffic by a meaningful margin. Cloudflare's script is rarely blocked, so the gap
   between the two numbers tells you how much you are missing.
4. **Bing Webmaster Tools** — free, and Bing's index feeds ChatGPT search, which matters
   given the `llms.txt` in this repo.
