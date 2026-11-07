// contexts/SuccessAnimationContext.tsx
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { SuccessAnimation } from '@/components/ui/SuccessAnimation';
import { SUCCESS_ANIMATIONS, SuccessAnimationType } from '@/constants/successAnimations';

interface SuccessAnimationContextType {
  showSuccess: (type?: SuccessAnimationType, message?: string) => void;
}

const SuccessAnimationContext = createContext<SuccessAnimationContextType | undefined>(undefined);

export function SuccessAnimationProvider({ children }: { children: React.ReactNode }) {
  const [animation, setAnimation] = useState<{
    visible: boolean;
    type?: SuccessAnimationType;
    message?: string;
  }>({ visible: false });

  const showSuccess = useCallback((type: SuccessAnimationType = 'default', message?: string) => {
    console.log('🎉 SuccessAnimationContext: Affichage animation pour', type, message);
    setAnimation({ visible: true, type, message });
  }, []);

  const handleComplete = useCallback(() => {
    // Petit délai pour s'assurer que le fade-out est terminé avant de reset
    setTimeout(() => {
      setAnimation({ visible: false });
    }, 100);
  }, []);

  // Valeur stable : l'état de l'animation reste local au provider.
  const value = useMemo(() => ({ showSuccess }), [showSuccess]);

  const config = animation.type
    ? SUCCESS_ANIMATIONS[animation.type] || SUCCESS_ANIMATIONS.default
    : SUCCESS_ANIMATIONS.default;

  return (
    <SuccessAnimationContext.Provider value={value}>
      {children}

      <SuccessAnimation
        visible={animation.visible}
        icon={config.icon}
        color={config.color}
        message={animation.message}
        onComplete={handleComplete}
      />
    </SuccessAnimationContext.Provider>
  );
}

export function useSuccessAnimation() {
  const context = useContext(SuccessAnimationContext);
  if (!context) {
    throw new Error('useSuccessAnimation must be used within SuccessAnimationProvider');
  }
  return context;
}

// Alias explicite : la valeur ne contient que des actions stables.
export const useSuccessAnimationActions = useSuccessAnimation;
