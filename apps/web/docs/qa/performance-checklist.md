# Performance Testing Checklist

**Purpose:** Ensure the application meets performance targets and provides a good user experience.

**Tools:**
- Lighthouse (Chrome DevTools or CLI)
- Playwright performance tests
- Chrome DevTools Performance tab
- WebPageTest (optional)

## Performance Targets

### Core Web Vitals
- **LCP (Largest Contentful Paint):** < 2.5 seconds
- **FID (First Input Delay):** < 100 milliseconds
- **CLS (Cumulative Layout Shift):** < 0.1

### Lighthouse Scores
- **Performance:** > 70 (target: 90+)
- **Accessibility:** > 90
- **Best Practices:** > 90
- **SEO:** > 80

### Load Time Metrics
- **First Contentful Paint (FCP):** < 1.8 seconds
- **Time to Interactive (TTI):** < 3.8 seconds
- **Total Blocking Time (TBT):** < 200 milliseconds
- **Speed Index:** < 3.4 seconds

## Automated Tests

Run performance tests:

```bash
cd apps/web
pnpm test:e2e -- performance-lighthouse
```

## Manual Testing with Lighthouse

### Chrome DevTools

1. Open Chrome DevTools (F12)
2. Go to "Lighthouse" tab
3. Select:
   - Performance
   - Accessibility (optional)
   - Best Practices (optional)
   - SEO (optional)
4. Select "Desktop" or "Mobile"
5. Click "Analyze page load"

### Lighthouse CLI

Install Lighthouse CLI:
```bash
npm install -g lighthouse
```

Run audit:
```bash
lighthouse https://churnsaver-staging.vercel.app/ --output=html --output-path=./lighthouse-report.html
```

## Pages to Test

### Landing Page
**URL:** `https://churnsaver-staging.vercel.app/`

**Targets:**
- Performance Score: > 80
- LCP: < 2.5s
- FCP: < 1.8s
- CLS: < 0.1

### Dashboard (QA Demo)
**URL:** `https://churnsaver-staging.vercel.app/dashboard/demo-company?qa_demo=true`

**Targets:**
- Performance Score: > 70
- LCP: < 3.0s (can be slower due to data loading)
- TTI: < 4.0s

### Settings (QA Demo)
**URL:** `https://churnsaver-staging.vercel.app/settings?qa_demo=true`

**Targets:**
- Performance Score: > 70
- LCP: < 2.5s
- TTI: < 3.5s

## Performance Checklist

### Initial Load
- [ ] Page loads within 3 seconds
- [ ] First contentful paint < 1.8s
- [ ] Largest contentful paint < 2.5s
- [ ] Time to interactive < 3.8s
- [ ] No layout shifts (CLS < 0.1)

### Resource Loading
- [ ] JavaScript bundles are optimized
- [ ] Images are optimized (WebP, proper sizing)
- [ ] CSS is minified and critical CSS inlined
- [ ] Fonts load efficiently (font-display: swap)
- [ ] No render-blocking resources

### Runtime Performance
- [ ] Smooth scrolling (60 FPS)
- [ ] No janky animations
- [ ] Interactions respond quickly (< 100ms)
- [ ] No memory leaks
- [ ] Efficient re-renders

### Network Efficiency
- [ ] API calls are batched where possible
- [ ] No duplicate requests
- [ ] Proper caching headers
- [ ] Gzip/Brotli compression enabled
- [ ] CDN used for static assets

### Mobile Performance
- [ ] Mobile Lighthouse score > 70
- [ ] Touch interactions are responsive
- [ ] Images are properly sized for mobile
- [ ] No excessive data usage

## Performance Monitoring

### Chrome DevTools Performance Tab

1. Open DevTools (F12)
2. Go to "Performance" tab
3. Click record
4. Interact with the page
5. Stop recording
6. Analyze:
   - Main thread activity
   - Long tasks
   - Layout shifts
   - Memory usage

### Network Tab

1. Open DevTools (F12)
2. Go to "Network" tab
3. Reload page
4. Check:
   - Total load time
   - Resource sizes
   - Waterfall chart
   - Blocking resources

## Common Performance Issues

### Critical (P0)
- LCP > 4 seconds
- TTI > 5 seconds
- CLS > 0.25
- JavaScript bundle > 1MB
- Render-blocking resources

### High (P1)
- FCP > 2.5 seconds
- TBT > 300ms
- Unoptimized images
- Missing compression
- No caching

### Medium (P2)
- Performance score 50-70
- Large font files
- Unused JavaScript
- Inefficient API calls

## Test Results Log

**Date:** _______________  
**Tester:** _______________  
**Browser:** _______________  
**Device:** _______________

### Lighthouse Scores

| Page | Performance | Accessibility | Best Practices | SEO |
|------|-------------|---------------|----------------|-----|
| Landing | ___ | ___ | ___ | ___ |
| Dashboard | ___ | ___ | ___ | ___ |
| Settings | ___ | ___ | ___ | ___ |

### Core Web Vitals

| Page | LCP | FID | CLS |
|------|-----|-----|-----|
| Landing | ___ | ___ | ___ |
| Dashboard | ___ | ___ | ___ |
| Settings | ___ | ___ | ___ |

### Load Time Metrics

| Page | FCP | TTI | TBT |
|------|-----|-----|-----|
| Landing | ___ | ___ | ___ |
| Dashboard | ___ | ___ | ___ |
| Settings | ___ | ___ | ___ |

### Issues Found
1. [Issue description] - Metric: [LCP/FID/CLS/etc] - Current: [value] - Target: [value] - Priority: [P0/P1/P2] - Status: [Open/Fixed]
2. ...

### Screenshots/Reports
- [Link to Lighthouse reports]
- [Link to performance profiles]

## Optimization Recommendations

### Quick Wins
- Enable compression (Gzip/Brotli)
- Optimize images (WebP, proper sizing)
- Minify CSS/JavaScript
- Enable browser caching
- Remove unused code

### Advanced
- Code splitting
- Lazy loading
- Service worker caching
- Prefetching critical resources
- Database query optimization

## Resources

- [Web Vitals](https://web.dev/vitals/)
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [PageSpeed Insights](https://pagespeed.web.dev/)
- [WebPageTest](https://www.webpagetest.org/)

