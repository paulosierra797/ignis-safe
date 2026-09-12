import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function useLandingScrollMotion(root) {
  useGSAP((context, contextSafe) => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const seen = new WeakSet();
      const observer = new IntersectionObserver(contextSafe(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          if (entry.boundingClientRect.top < 0) return;
          gsap.fromTo(entry.target, { y: 18, opacity: 0.65 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out', clearProps: 'transform,opacity' });
        });
      }), { threshold: 0, rootMargin: '0px 0px -40px 0px' });
      const watchSections = () => {
        root.current?.querySelectorAll(':scope > section').forEach(section => {
          if (seen.has(section)) return;
          seen.add(section);
          // Keep first-screen content immediate; animate sections reached by scrolling.
          if (section.getBoundingClientRect().top >= window.innerHeight) observer.observe(section);
        });
      };
      watchSections();
      const changes = new MutationObserver(watchSections);
      changes.observe(root.current, { childList: true });
      return () => { observer.disconnect(); changes.disconnect(); };
    });
    return () => media.revert();
  }, { scope: root });
}
