## 📝 Description

Brief description of changes made in this pull request.

## 🎯 Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Security improvement
- [ ] Dependency update
- [ ] Other (please describe)

## 🔗 Related Issues

Closes #
Fixes #
Relates to #

## 📋 Summary of Changes

### Changes Made
- [ ] **Feature**: [Describe new feature added]
- [ ] **Fix**: [Describe bug fixed]
- [ ] **Refactor**: [Describe code refactored]
- [ ] **Documentation**: [Describe documentation updated]
- [ ] **Tests**: [Describe tests added/updated]
- [ ] **Configuration**: [Describe configuration changes]

### Files Modified
- [ ] `apps/web/src/app/` - [Description of changes]
- [ ] `apps/web/src/components/` - [Description of changes]
- [ ] `apps/web/src/lib/` - [Description of changes]
- [ ] `apps/web/src/server/` - [Description of changes]
- [ ] `apps/web/docs/` - [Description of changes]
- [ ] `infra/` - [Description of changes]
- [ ] `docs/` - [Description of changes]

## 🧪 Testing

### Test Coverage
- [ ] Unit tests added for new functionality
- [ ] Integration tests added for API changes
- [ ] End-to-end tests added for user workflows
- [ ] Existing tests updated to reflect changes
- [ ] Test coverage meets project requirements (80%+)

### Manual Testing
- [ ] Tested in development environment
- [ ] Tested in staging environment (if applicable)
- [ ] Cross-browser testing completed (Chrome, Firefox, Safari)
- [ ] Mobile testing completed (if applicable)
- [ ] Accessibility testing completed

### Test Results
```bash
# Paste test results here
pnpm test

# Example output:
✓ All tests passed (123 tests, 0 failures)
Coverage: 85.6%
```

## 🔍 Code Review Checklist

### Code Quality
- [ ] Code follows project style guidelines (Biome linting passes)
- [ ] Code is properly formatted (Biome formatting passes)
- [ ] TypeScript compilation succeeds (no type errors)
- [ ] Code is self-documenting with clear comments
- [ ] No hardcoded values or magic numbers
- [ ] No console.log statements left in code
- [ ] No TODO comments left without follow-up issues

### Security & Performance
- [ ] No security vulnerabilities introduced
- [ ] Input validation implemented where required
- [ ] Authentication/authorization properly implemented
- [ ] Sensitive data properly handled
- [ ] Database queries optimized
- [ ] No memory leaks or performance regressions

### Best Practices
- [ ] Follows established patterns in codebase
- [ ] Proper error handling implemented
- [ ] Environment variables documented if added
- [ ] Dependencies updated if required
- [ ] Migration scripts included for database changes

## 📚 Documentation

### Code Documentation
- [ ] JSDoc comments added for new functions
- [ ] Complex logic explained with comments
- [ ] API documentation updated for new endpoints
- [ ] Component props documented

### User Documentation
- [ ] README updated if necessary
- [ ] User guide updated for new features
- [ ] API documentation updated
- [ ] Changelog updated
- [ ] Migration guide provided for breaking changes

## 🌐 Environment Impact

### Database Changes
- [ ] Migration scripts provided
- [ ] Rollback scripts provided
- [ ] Migration tested in development
- [ ] Migration tested in staging
- [ ] Data backup recommendations documented

### External Dependencies
- [ ] New dependencies added (with justification)
- [ ] Dependencies updated (with changelog review)
- [ ] Security vulnerabilities checked
- [ ] License compatibility verified

### Configuration Changes
- [ ] Environment variables documented
- [ ] Configuration examples provided
- [ ] Default values specified
- [ ] Migration instructions provided

## 🚀 Deployment

### Pre-deployment Checks
- [ ] All automated checks pass (CI/CD)
- [ ] Code review completed and approved
- [ ] Tests passing in all environments
- [ ] Security scans pass
- [ ] Performance benchmarks met

### Deployment Strategy
- [ ] Feature flag implemented (if needed)
- [ ] Rollback plan documented
- [ ] Monitoring and alerting configured
- [ ] Post-deployment verification planned

## 📊 Performance Impact

### Metrics
- [ ] Bundle size impact assessed
- [ ] Database query performance tested
- [ ] API response time measured
- [ ] Memory usage analyzed
- [ ] CPU usage monitored

### Benchmarks
```bash
# Paste performance benchmarks here
# Example:
# Before: 2.3s load time, 45MB bundle
# After: 1.8s load time, 42MB bundle
# Improvement: 22% faster, 7% smaller
```

## 🔒 Security Review

### Security Checklist
- [ ] No sensitive data in logs
- [ ] Proper input sanitization
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Rate limiting implemented
- [ ] Authentication properly implemented
- [ ] Authorization properly implemented

### Security Tools
- [ ] Snyk scan passed
- [ ] OWASP ZAP scan passed
- [ ] Dependency vulnerability scan passed
- [ ] Code security review completed

## ♿ Accessibility

### WCAG Compliance
- [ ] Screen reader compatibility tested
- [ ] Keyboard navigation tested
- [ ] Color contrast verified
- [ ] Focus management implemented
- [ ] ARIA labels added where needed
- [ ] Alternative text for images provided

### Testing Tools
- [ ] axe DevTools scan passed
- [ ] WAVE evaluation passed
- [ ] Screen reader testing completed
- [ ] Keyboard-only navigation tested

## 🏷️ Labels

Please add relevant labels to help categorize this PR:

**Type Labels:**
- `bug` - Bug fix
- `enhancement` - New feature or improvement
- `documentation` - Documentation changes
- `performance` - Performance improvements
- `security` - Security improvements
- `refactoring` - Code refactoring

**Priority Labels:**
- `critical` - Critical changes requiring immediate attention
- `high-priority` - High priority changes
- `medium-priority` - Medium priority changes
- `low-priority` - Low priority changes

**Status Labels:**
- `work-in-progress` - Still being developed
- `ready-for-review` - Ready for code review
- `needs-changes` - Changes requested
- `approved` - Approved for merge

**Area Labels:**
- `frontend` - Frontend changes
- `backend` - Backend changes
- `api` - API changes
- `database` - Database changes
- `infrastructure` - Infrastructure changes
- `testing` - Testing changes
- `documentation` - Documentation changes

## 📸 Screenshots/Videos

If this PR includes UI changes, please add screenshots or videos:

### Before
![Before changes](#)

### After
![After changes](#)

## 🔗 Additional Resources

- **Design Mockups**: [Link to Figma, Sketch, etc.]
- **API Documentation**: [Link to API docs]
- **User Stories**: [Link to user stories]
- **Technical Specifications**: [Link to tech specs]

## 📝 Additional Notes

Add any other context, screenshots, or examples about the pull request here.

## ✅ Final Checklist

- [ ] I have read the [Contributing Guidelines](https://github.com/your-org/churn-saver/blob/main/CONTRIBUTING.md)
- [ ] I have performed a self-review of my own code
- [ ] My code follows the style guidelines of this project
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules
- [ ] I have checked my code and corrected any misspellings
- [ ] I have considered the accessibility implications of my changes
- [ ] I have considered the security implications of my changes
- [ ] I have considered the performance implications of my changes

## 🤝 Reviewers

**Required Reviewers:**
- [ ] @team-lead (for breaking changes or major features)
- [ ] @security-reviewer (for security changes)
- [ ] @performance-reviewer (for performance changes)

**Optional Reviewers:**
- [ ] @domain-expert (for domain-specific changes)
- [ ] @accessibility-reviewer (for UI/UX changes)

---

**Thank you for contributing to Churn Saver! 🎉**

For questions about this pull request:
- Comment on this PR
- Join our [Slack channel](https://churn-saver.slack.com)
- Start a [GitHub Discussion](https://github.com/your-org/churn-saver/discussions)