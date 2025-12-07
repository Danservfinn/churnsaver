import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { CheckCircle2, AlertCircle, AlertTriangle, Info, PartyPopper, Cloud } from "lucide-react"

const alertVariants = cva(
  "relative w-full rounded-lg border p-4 animate-in fade-in slide-in-from-top-2 duration-300 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
  {
    variants: {
      variant: {
        default: "bg-background text-foreground",
        destructive:
          "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive bg-destructive/5",
        success:
          "border-accent/50 text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-900/20 [&>svg]:text-accent-600 dark:[&>svg]:text-accent-400",
        warning:
          "border-secondary/50 text-secondary-700 dark:text-secondary-400 bg-secondary-50 dark:bg-secondary-900/20 [&>svg]:text-secondary-600 dark:[&>svg]:text-secondary-400",
        info:
          "border-primary/50 text-primary-700 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 [&>svg]:text-primary-600 dark:[&>svg]:text-primary-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const iconMap = {
  default: Info,
  destructive: Cloud,
  success: PartyPopper,
  warning: AlertTriangle,
  info: Info,
} as const

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  showIcon?: boolean
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'default', showIcon = true, children, ...props }, ref) => {
    const Icon = showIcon ? iconMap[variant || 'default'] : null
    
    return (
      <div
        ref={ref}
        role={variant === 'destructive' ? 'alert' : 'status'}
        aria-live={variant === 'destructive' ? 'assertive' : 'polite'}
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
        {children}
      </div>
    )
  }
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }

