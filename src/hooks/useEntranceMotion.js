import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function useEntranceMotion(selector) {
  const scope = useRef(null);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = selector ? scope.current.querySelectorAll(selector) : scope.current;
      gsap.from(targets, {
        y: 8,
        opacity: 0.65,
        duration: 0.4,
        stagger: 0.06,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
      });
    });
    return () => media.revert();
  }, { scope, dependencies: [selector], revertOnUpdate: true });

  return scope;
}
