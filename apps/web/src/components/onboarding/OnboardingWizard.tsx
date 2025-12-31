'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useWhop, useWhopCompany } from '@/lib/context/whop';
import { WelcomeStep } from './WelcomeStep';
import { WebhookVerifyStep } from './WebhookVerifyStep';
import { ConfigureStep } from './ConfigureStep';
import { CompleteStep } from './CompleteStep';

export type OnboardingStep = 'welcome' | 'verify' | 'configure' | 'complete';

interface OnboardingWizardProps {
  companyId: string;
  companyName?: string;
  onComplete?: () => void;
}

export function OnboardingWizard({
  companyId,
  companyName,
  onComplete,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [webhookVerified, setWebhookVerified] = useState(false);
  const router = useRouter();
  const { getAuthHeaders } = useWhop();

  const handleNext = () => {
    const steps: OnboardingStep[] = ['welcome', 'verify', 'configure', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: OnboardingStep[] = ['welcome', 'verify', 'configure', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleComplete = async () => {
    // Mark onboarding as complete via API
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: getAuthHeaders({ companyId }),
      });
    } catch {
      // Continue even if API call fails - we'll mark complete anyway
    }

    // Store completion in localStorage as backup
    localStorage.setItem(`onboarding_complete_${companyId}`, 'true');

    if (onComplete) {
      onComplete();
    } else {
      router.push(`/dashboard/${companyId}`);
    }
  };

  const handleWebhookVerified = (verified: boolean) => {
    setWebhookVerified(verified);
  };

  const stepComponents = {
    welcome: (
      <WelcomeStep
        companyName={companyName}
        onNext={handleNext}
      />
    ),
    verify: (
      <WebhookVerifyStep
        companyId={companyId}
        onNext={handleNext}
        onSkip={handleSkip}
        onVerified={handleWebhookVerified}
      />
    ),
    configure: (
      <ConfigureStep
        companyId={companyId}
        onNext={handleNext}
        onSkip={handleSkip}
        onBack={handleBack}
      />
    ),
    complete: (
      <CompleteStep
        companyId={companyId}
        onComplete={handleComplete}
      />
    ),
  };

  const steps: { id: OnboardingStep; label: string }[] = [
    { id: 'welcome', label: 'Welcome' },
    { id: 'verify', label: 'Verify' },
    { id: 'configure', label: 'Configure' },
    { id: 'complete', label: 'Complete' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-2xl">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2">
            {steps.map((step, index) => {
              const isActive = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <div key={step.id} className="flex items-center">
                  <motion.div
                    initial={false}
                    animate={{
                      scale: isCurrent ? 1.1 : 1,
                      opacity: isActive ? 1 : 0.4,
                    }}
                    className="flex items-center gap-2"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                        isCurrent
                          ? 'bg-primary text-white'
                          : isActive
                            ? 'bg-green-500 text-white'
                            : 'bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span
                      className={`text-sm font-medium hidden sm:inline ${
                        isCurrent
                          ? 'text-primary'
                          : isActive
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </motion.div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-8 sm:w-12 h-px mx-2 transition-colors ${
                        index < currentStepIndex ? 'bg-green-500' : 'bg-zinc-700'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {stepComponents[currentStep]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
