# Kilo Code Error Handling Workflow

**Version:** 1.0.0  
**Description:** Automatic follow-up workflow for Kilo Code errors  
**Last Modified:** 2025-10-25

---

## Workflow: Thinking Process Failure Handler

### Overview
Handles "Kilo Code is having trouble" errors with automatic guidance to help users resolve the issue.

### Configuration

**Name:** `go`  
**Status:** Enabled  
**Priority:** High

### Trigger

**Type:** Error Message Detection

**Primary Pattern:**
```
"Kilo Code is having trouble"
```

**Context Pattern:**
```
"failure in the model's thought process or inability to use a tool properly"
```

**Match Type:** Contains

### Conditions

The workflow activates when:
- ✓ Error is displayed to user
- ✓ User interaction is blocked by the error

### Actions

#### 1. Display Guidance Message

**Timing:** Immediate  
**Dismissible:** No  
**Position:** After error message

**Message:**
```
Try breaking down the task into smaller steps.
```

**Style:** Guidance

#### 2. Log Event

**Log Level:** Info  
**Log Message:** "Automatic guidance displayed for thinking process failure"  
**Include Context:** Yes

### Rationale

Breaking down complex tasks helps the model by:
- Reducing cognitive load per operation
- Making steps more explicit and actionable
- Enabling intermediate validation
- Providing clearer context for tool usage

### Example Scenarios

| Scenario | Expected Behavior |
|----------|------------------|
| Complex multi-file refactoring | Display guidance message immediately after error |
| Large-scale code generation | Display guidance message immediately after error |
| Intricate debugging tasks | Display guidance message immediately after error |
| Multi-step architectural changes | Display guidance message immediately after error |

---

## Settings

### Retry Behavior
- **Auto Retry:** Disabled
- **Retry Delay:** N/A
- **Max Retries:** 0

### User Feedback
- **Allow Feedback:** Enabled
- **Feedback Prompt:** "Was this guidance helpful?"

### Analytics
- **Track Trigger Count:** Enabled
- **Track User Response:** Enabled
- **Track Resolution Success:** Enabled

---

## Metadata

**Tags:** `error-handling`, `user-guidance`, `automatic-recovery`  
**Created By:** System
