# Incentive Management

The Churn Saver incentive system provides flexible, automated customer retention incentives that can be configured based on customer behavior, risk level, and business objectives.

## Overview

### Incentive Types

Churn Saver supports multiple incentive types to accommodate different retention strategies and customer segments.

#### 1. Discount Incentives

**Percentage Discounts**:
- Apply a percentage reduction to the customer's next billing
- Configurable percentage (1-100%)
- One-time or recurring application

**Fixed Amount Discounts**:
- Deduct a specific dollar amount from the customer's bill
- Useful for high-value customer retention
- Precise budget control

#### 2. Account Credits

**Monetary Credits**:
- Add credits to the customer's account balance
- Can be applied to future purchases or services
- Flexible expiration policies

**Service Credits**:
- Credits specifically for service usage (API calls, storage, etc.)
- Prevents bill shock for usage-based services
- Automatic application at billing time

#### 3. Feature Upgrades

**Trial Extensions**:
- Extend premium feature access temporarily
- Allow customers to experience full value
- Automatic reversion after trial period

**Feature Unlocks**:
- Temporarily enable premium features
- Demonstrate value of higher tiers
- Encourage natural upgrades

#### 4. Custom Incentives

**Flexible Configuration**:
- Business-specific incentive types
- Custom validation rules
- Integration with external systems

## Incentive Configuration

### Creating Incentive Templates

#### Basic Template Structure

```typescript
interface IncentiveTemplate {
  id: string;
  name: string;
  type: 'discount' | 'credit' | 'feature' | 'custom';
  config: IncentiveConfig;
  eligibility: EligibilityRules;
  budget: BudgetConstraints;
  expiration: ExpirationPolicy;
  priority: number;
}
```

#### Example Configurations

**High-Value Customer Discount**:
```json
{
  "name": "VIP Recovery Discount",
  "type": "discount",
  "config": {
    "discountType": "percentage",
    "value": 50,
    "duration": "one_time"
  },
  "eligibility": {
    "minLifetimeValue": 1000,
    "maxPreviousDiscounts": 2,
    "customerSegment": "enterprise"
  },
  "budget": {
    "monthlyLimit": 5000,
    "perCustomerLimit": 100
  }
}
```

**Usage-Based Credit**:
```json
{
  "name": "API Credit Boost",
  "type": "credit",
  "config": {
    "creditType": "service",
    "amount": 100000,
    "unit": "api_calls",
    "expiresIn": 90
  },
  "eligibility": {
    "minMonthlyUsage": 50000,
    "subscriptionTier": "pro"
  }
}
```

### Eligibility Rules

#### Customer-Based Rules

**Lifetime Value Thresholds**:
```typescript
const eligibilityRules = {
  minLifetimeValue: 500,    // Minimum total payments
  maxLifetimeValue: 50000,  // Maximum total payments
  paymentHistory: {
    minSuccessfulPayments: 3,
    maxFailedPayments: 2
  }
};
```

**Behavioral Criteria**:
```typescript
const behavioralRules = {
  accountAge: {
    minDays: 30,           // Account must be at least 30 days old
    maxDays: 365           // Account not older than 1 year
  },
  usageMetrics: {
    minMonthlyActiveUsers: 10,
    maxChurnRiskScore: 0.7
  }
};
```

**Subscription Criteria**:
```typescript
const subscriptionRules = {
  currentPlan: ['pro', 'enterprise'],
  previousPlans: ['starter'],  // Must have upgraded from starter
  billingCycle: 'monthly',     // Only monthly subscribers
  cancellationReason: {
    exclude: ['fraud', 'abuse']  // Exclude certain cancellation reasons
  }
};
```

### Budget Management

#### Budget Constraints

**Monthly Budget Limits**:
```typescript
const budgetConstraints = {
  monthlyLimit: 10000,        // Total budget per month
  perCustomerLimit: 500,      // Maximum per customer
  perIncentiveLimit: 100,     // Maximum per incentive type
  reservePercentage: 0.1      // 10% reserve for emergencies
};
```

**Dynamic Budget Allocation**:
```typescript
function allocateBudget(incentive: IncentiveTemplate, customer: Customer): number {
  const baseValue = incentive.config.value;
  const customerValue = customer.lifetimeValue;

  // Scale incentive based on customer value
  if (customerValue > 10000) return Math.min(baseValue * 1.5, budgetConstraints.perCustomerLimit);
  if (customerValue > 5000) return Math.min(baseValue * 1.2, budgetConstraints.perCustomerLimit);
  return baseValue;
}
```

### Expiration Policies

#### Time-Based Expiration

```typescript
const expirationPolicies = {
  immediate: {
    type: 'immediate',
    gracePeriod: 0
  },
  standard: {
    type: 'time_based',
    expiresIn: 30,  // days
    reminderDays: [7, 14, 21]  // reminder notifications
  },
  conditional: {
    type: 'conditional',
    expiresOn: 'next_billing_cycle',
    conditions: ['payment_success', 'feature_usage']
  }
};
```

#### Usage-Based Expiration

```typescript
const usageExpiration = {
  type: 'usage_based',
  maxUsage: 1000,  // API calls, storage GB, etc.
  resetPeriod: 'monthly',
  rolloverAllowed: true
};
```

## Incentive Application

### Automated Application

#### Rule-Based Application

```typescript
async function applyIncentive(caseId: string, customerId: string): Promise<IncentiveResult> {
  // 1. Get customer profile and risk assessment
  const customer = await getCustomerProfile(customerId);
  const riskLevel = await assessChurnRisk(customer);

  // 2. Find eligible incentives
  const eligibleIncentives = await findEligibleIncentives(customer, riskLevel);

  // 3. Select optimal incentive based on priority and budget
  const selectedIncentive = selectOptimalIncentive(eligibleIncentives);

  // 4. Check budget constraints
  const budgetCheck = await checkBudgetConstraints(selectedIncentive, customer);

  if (!budgetCheck.approved) {
    return { success: false, reason: 'budget_exceeded' };
  }

  // 5. Apply the incentive
  const application = await applyIncentiveToCustomer(selectedIncentive, customer);

  // 6. Track application for analytics
  await trackIncentiveApplication(application);

  return { success: true, incentiveId: application.id };
}
```

#### Priority-Based Selection

```typescript
function selectOptimalIncentive(incentives: IncentiveTemplate[]): IncentiveTemplate {
  return incentives
    .filter(i => i.budget.currentUsage < i.budget.monthlyLimit)
    .sort((a, b) => {
      // Primary: Risk-appropriate priority
      if (a.priority !== b.priority) return b.priority - a.priority;

      // Secondary: Cost effectiveness
      const aCostPerRecovery = calculateCostPerRecovery(a);
      const bCostPerRecovery = calculateCostPerRecovery(b);
      return aCostPerRecovery - bCostPerRecovery;

      // Tertiary: Budget availability
      return (b.budget.monthlyLimit - b.budget.currentUsage) -
             (a.budget.monthlyLimit - a.budget.currentUsage);
    })[0];
}
```

### Manual Override Capabilities

#### Admin Dashboard Controls

**Incentive Approval Workflow**:
1. System suggests optimal incentive
2. Admin reviews and can modify
3. Budget validation occurs
4. Manual approval required for high-value incentives
5. Audit trail maintained

**Custom Incentive Creation**:
```typescript
// Admin can create one-off incentives
const customIncentive = await createCustomIncentive({
  customerId: 'customer_123',
  type: 'discount',
  value: 75,  // 75% discount
  reason: 'Executive decision',
  approvedBy: 'admin_user_id'
});
```

## Tracking and Analytics

### Incentive Performance Metrics

#### Success Rate Tracking

```typescript
interface IncentiveMetrics {
  totalApplied: number;
  totalRedeemed: number;
  totalExpired: number;
  recoveryRate: number;  // (recovered_with_incentive / total_applied) * 100
  averageValue: number;
  costPerRecovery: number;
  roi: number;  // (revenue_recovered - incentive_cost) / incentive_cost
}
```

#### Real-Time Dashboard

**Key Metrics Displayed**:
- Active incentives by type
- Budget utilization percentage
- Recovery rate by incentive type
- Cost per successful recovery
- Customer lifetime value impact

### Reporting and Insights

#### Automated Reports

**Daily Summary**:
- Incentives applied today
- Recovery success rate
- Budget utilization
- Top performing incentives

**Monthly Analysis**:
- ROI by incentive type
- Customer segment performance
- Trend analysis over time
- Recommendations for optimization

## Integration Points

### External Systems Integration

#### Payment Processor Integration

**Stripe Integration**:
```typescript
// Apply discount to Stripe customer
async function applyStripeDiscount(customerId: string, discount: DiscountIncentive) {
  const customer = await stripe.customers.retrieve(customerId);

  if (discount.type === 'percentage') {
    await stripe.customers.update(customerId, {
      coupon: createPercentageCoupon(discount.value)
    });
  } else {
    await stripe.customers.update(customerId, {
      account_balance: -discount.value * 100  // Convert to cents
    });
  }
}
```

#### CRM System Integration

**Salesforce Integration**:
```typescript
// Update CRM with incentive information
async function updateCRMAccount(accountId: string, incentive: AppliedIncentive) {
  await salesforce.updateAccount(accountId, {
    churn_recovery_status: 'incentive_applied',
    last_incentive_date: new Date(),
    incentive_type: incentive.type,
    incentive_value: incentive.value,
    expected_recovery_date: calculateExpectedRecovery(incentive)
  });
}
```

### API Endpoints

#### Incentive Management APIs

**Create Incentive Template**:
```http
POST /api/incentives/templates
Content-Type: application/json

{
  "name": "High-Value Recovery",
  "type": "discount",
  "config": {
    "discountType": "percentage",
    "value": 30
  },
  "eligibility": {
    "minLifetimeValue": 1000
  },
  "budget": {
    "monthlyLimit": 5000
  }
}
```

**Apply Incentive to Customer**:
```http
POST /api/cases/{caseId}/incentives
Content-Type: application/json

{
  "templateId": "template_123",
  "customValue": 25
}
```

**Get Incentive Analytics**:
```http
GET /api/analytics/incentives?period=30d&groupBy=type
```

## Best Practices

### Incentive Design

**Customer-Centric Approach**:
- Understand customer pain points
- Offer incentives that address specific concerns
- Personalize based on customer history

**Business Value Focus**:
- Calculate ROI for each incentive type
- Monitor long-term customer value impact
- Optimize for profitable retention

**Budget Optimization**:
- Set realistic budget limits
- Monitor utilization rates
- Adjust based on performance data

### Technical Best Practices

**Data Validation**:
- Validate all incentive configurations
- Check budget constraints before application
- Ensure data consistency across systems

**Error Handling**:
- Graceful failure for external system issues
- Retry mechanisms for transient failures
- Comprehensive error logging

**Performance Optimization**:
- Cache frequently accessed incentive templates
- Batch processing for bulk operations
- Database indexing for performance

## Troubleshooting

### Common Issues

**Incentives Not Applying**:
- Check eligibility criteria
- Verify budget availability
- Review error logs for failures

**Budget Overruns**:
- Implement budget alerts
- Add approval workflows for large incentives
- Regular budget reviews

**Low Redemption Rates**:
- Review incentive relevance
- Test different incentive types
- Analyze customer feedback

### Monitoring and Alerts

**Automated Alerts**:
- Budget threshold warnings (80%, 90%, 100%)
- Low success rate alerts
- System performance degradation

**Regular Reviews**:
- Weekly budget utilization review
- Monthly incentive performance analysis
- Quarterly strategy optimization

## Next Steps

- **[Recovery System](recovery-system.md)** - Complete recovery workflow
- **[Dashboard & Analytics](dashboard.md)** - Incentive performance monitoring
- **[API Reference](../api/rest-api.md)** - Incentive management endpoints
- **[Testing Guide](../testing/overview.md)** - Incentive testing scenarios