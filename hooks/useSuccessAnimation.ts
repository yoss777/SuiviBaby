// hooks/useSuccessAnimation.ts
import { useState, useCallback } from 'react';
import { SUCCESS_ANIMATIONS, SuccessAnimationType } from '@/constants/successAnimations';

interface SuccessAnimationState {
  visible: boolean;
  type?: SuccessAnimationType;
}

export function useSuccessAnimation() {
  const [animation, setAnimation] = useState<SuccessAnimationState>({
    visible: false,
  });

  const showSuccess = useCallback((type: SuccessAnimationType = 'default') => {
    setAnimation({ visible: true, type });
  }, []);

  const hideSuccess = useCallback(() => {
    setAnimation({ visible: false });
  }, []);

  const getAnimationConfig = useCallback(() => {
    if (!animation.type) {
      return SUCCESS_ANIMATIONS.default;
    }
    return SUCCESS_ANIMATIONS[animation.type] || SUCCESS_ANIMATIONS.default;
  }, [animation.type]);

  return {
    animation,
    showSuccess,
    hideSuccess,
    config: getAnimationConfig(),
  };
}
