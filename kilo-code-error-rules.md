# Kilo Code Error Handling Rules

## Automatic Follow-up Rules

### Rule: Thinking Process Failure

**Trigger Condition:**
```
Error Message: "Kilo Code is having trouble..."
Context: "This may indicate a failure in the model's thought process or inability to use a tool properly"
```

**Automatic Follow-up Action:**
When this error is detected, automatically append the following message to help guide the user:

```
Try breaking down the task into smaller steps.
```

**Implementation Details:**
- **Error Pattern Match**: `"Kilo Code is having trouble"`
- **Follow-up Type**: Automatic guidance message
- **Priority**: High (always show this guidance)
- **User Dismissible**: No (always display)

**Rationale:**
This error typically indicates that the task complexity has exceeded the model's current processing capabilities. Breaking down the task into smaller, discrete steps often resolves the issue by:
1. Reducing cognitive load per operation
2. Making each step more explicit and actionable
3. Allowing for intermediate validation and correction
4. Providing clearer context for tool usage

**Example Scenarios:**
- Complex multi-file refactoring
- Large-scale code generation
- Intricate debugging tasks
- Multi-step architectural changes

---

## Rule Format Specification

Each rule follows this structure:
- **Trigger Condition**: The error message or pattern that activates the rule
- **Automatic Follow-up Action**: The message or action to execute
- **Implementation Details**: Technical specifications for the rule
- **Rationale**: Why this rule exists and what it addresses
- **Example Scenarios**: Common situations where this rule applies
