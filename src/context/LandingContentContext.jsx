import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useUser } from './UserContext';
import { getLandingContentFromDb, saveLandingContentToDb } from '../utils/landingContentService';

const STORAGE_KEY = 'ignis_landing_content_v1';

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_LANDING_CONTENT = {
  hero: {
    title: 'Protecting lives, property and community',
    lead: 'Welcome to our Dasmarinas Fire Station portal.',
    description:
      'Learn about our services, contact details and FSIC & FSEC organization for safety, preparedness, and community support.'
  },
  about: {
    title: 'About us',
    intro:
      'The Dasmarinas Fire Station is committed to protecting lives, safety, and the environment through professional and expertise, emergency medical services, and disaster response. Our dedicated team of firefighters and first responders serve around the clock to ensure the safety of our community. We take pride in serving the public with a unwavering commitment towards emergency response and community service.',
    missionTitle: 'Our Mission',
    missionText:
      'We commit to prevent and suppress destructive fires, investigate its causes; enforce Fire Code and other related laws; respond to man-made and natural disasters and other emergencies.',
    visionTitle: 'Our Vision',
    visionText: 'A modern fire service fully capable of ensuring a fire safe nation by 2034.'
  },
  contact: {
    title: 'CONTACT INFORMATION',
    emergencyTitle: 'EMERGENCY HOTLINE OF BFP:',
    landlinePrimary: '(046) 884-6131',
    landlineSecondary: '416-0875',
    mobile: '0995 336 9534',
    email: 'dasmariasfire@gmail.com',
    facebookLabel: 'BFP-Dasmarinas FS Cavite',
    facebookUrl: 'https://www.facebook.com/GOLF.E207/'
  },
  process: {
    english: {
      title: 'Fire Safety Inspection Certificate (FSIC) & Fire Safety Evaluation Clearance (FSEC) Online Application',
      processSteps: [
        {
          title: 'ACCOUNT CREATION PROCESS',
          steps: [
            { num: 1, text: 'Go to fsic.bfp.gov.ph or scan the QR code.' },
            { num: 2, text: 'Click "Register Now" and fill up the form needed then click "Create Account".' },
            { num: 3, text: 'Check your Email; Click "Verify Email" or the account validation link.' }
          ]
        },
        {
          title: 'APPLICATION PROCESS',
          steps: [
            { num: 1, text: 'Proceed to Log in / Access your account after registration.' },
            { num: 2, text: 'Click "Apply Now" on your dashboard and select the application needed (FSEC, FSIC, Occupancy, Business Clearances).' },
            { num: 3, text: 'Fill up the form needed and click "Submit Application".' },
            { num: 4, text: 'Upload necessary documents to complete your application and click "Confirm Submission".' },
            { num: 5, text: 'Check application status on applications button.' }
          ]
        },
        {
          title: 'PAYMENT PROCESS',
          steps: [
            { num: 1, text: 'Check application status on applications button and Review Fees. The assessor will check your application and assess fire code fees.' },
            { num: 2, text: 'Once your application has been reviewed and assessed click "Capture Payment Details".' },
            { num: 3, text: 'Click "Pay Mobile Amount" and choose type of payment gateway (PAYMAYA OR BANK TRANSFER ONLY).' },
            { num: 4, text: 'Click "Proceed with Payment" select payment method, click "Pay Now" and "Yes Proceed".' }
          ]
        },
        {
          title: 'DOWNLOAD E-COPY',
          steps: [
            { num: 1, text: 'Access and Download your certificate or clearance by clicking "Issued Documents" on your application.' }
          ]
        }
      ]
    },
    tagalog: {
      title: 'Online Application para sa Fire Safety Inspection Certificate (FSIC) at Fire Safety Evaluation Clearance (FSEC)',
      processSteps: [
        {
          title: 'PROSESO NG PAGGAWA NG ACCOUNT',
          steps: [
            { num: 1, text: 'Pumunta sa fsic.bfp.com o i-scan ang QR code.' },
            { num: 2, text: 'I-click ang "Register Now", punan ang kinakailangang impormasyon, at piliin ang "Create Account".' },
            { num: 3, text: 'I-check ang iyong email at i-click ang "Verify Email" o ang account validation link.' }
          ]
        },
        {
          title: 'PROSESO NG APPLICATION',
          steps: [
            { num: 1, text: 'Mag-Log In gamit ang iyong account.' },
            { num: 2, text: 'Sa dashboard, i-click ang "Apply Now" at piliin ang uri ng aplikasyon (FSEC, FSIC, Occupancy, Business, Clearances).' },
            { num: 3, text: 'Punan ang form at i-click ang "Submit Application".' },
            { num: 4, text: 'I-upload ang mga kinakailangang dokumento at pindutin ang "Confirm Submission".' },
            { num: 5, text: 'I-check ang status sa Applications button.' }
          ]
        },
        {
          title: 'PAYMENT PROCESS',
          steps: [
            { num: 1, text: 'Sa Applications, tingnan ang status at ang Review Fees. Susuriin ng assessor ang iyong aplikasyon at itatakda ang kaukulang bayarin.' },
            { num: 2, text: 'Kapag na-review na, i-click ang "Capture Payment Details".' },
            { num: 3, text: 'Piliin ang "Pay Whole Amount" at pumili ng payment gateway (PayMaya o Bank Transfer lamang).' },
            { num: 4, text: 'I-click ang "Proceed with Payment," piliin ang paraan ng pagbabayad, pagkatapos ay "Pay Now" at "Yes, Proceed".' }
          ]
        },
        {
          title: 'DOWNLOAD E-COPY',
          steps: [
            { num: 1, text: 'Para makuha ang iyong certificate o clearance, pumunta sa iyong application at i-click ang "Issued Documents".' }
          ]
        }
      ]
    }
  },
  faq: {
    english: {
      title: 'FREQUENTLY ASKED QUESTIONS',
      faqs: [
        {
          question: 'What is FSEC?',
          answer: 'FSEC (Fire Safety Evaluation Clearance) is a document issued by the Bureau of Fire Protection (BFP). It certifies that the design plans of a building or structure comply with fire safety standards before construction begins.'
        },
        {
          question: 'What is FSIC for Occupancy?',
          answer: 'FSIC (Fire Safety Inspection Certificate) for Occupancy is issued by the Bureau of Fire Protection after inspection. It confirms that a building is safe to occupy and complies with fire safety requirements before people can use it.'
        },
        {
          question: 'What is FSIC for Business?',
          answer: 'FSIC for Business is also issued by the Bureau of Fire Protection. It certifies that a business establishment complies with fire safety regulations, and it is usually required when applying for or renewing a business permit.'
        },
        {
          question: 'What are the requirements to be a Fire Officer?',
          answer: [
            'Must be a Filipino citizen',
            'Must have a Bachelor\'s degree',
            'Must pass the Civil Service Exam (Fire Officer Exam)',
            'Must meet height and physical fitness requirements',
            'Must be of good moral character',
            'Must pass medical, psychological, and physical tests',
            'Must complete training (e.g., Basic Firefighter Course)'
          ]
        },
        {
          question: 'What to do in case of Kitchen Fire?',
          answer: [
            'Stay calm',
            'Turn off the stove if safe',
            'Do NOT use water (especially for oil/grease fires)',
            'Cover the fire with a lid or fire blanket',
            'Use a fire extinguisher (Class K or ABC)',
            'If the fire spreads, evacuate immediately',
            'Call emergency services'
          ]
        },
        {
          question: 'How to report a Fire Emergency?',
          answer: [
            'Call the emergency hotline 911 in the Philippines',
            'Provide clear details: exact location, type of fire, and if there are people trapped or injured',
            'Stay on the line and follow instructions',
            'You may also contact the nearest Bureau of Fire Protection station directly'
          ]
        }
      ]
    },
    tagalog: {
      title: 'MGA MADALAS ITANONG',
      faqs: [
        {
          question: 'Ano ang FSEC?',
          answer: 'Ang FSEC (Fire Safety Evaluation Clearance) ay dokumentong inilalabas ng Bureau of Fire Protection (BFP). Ito ay nagpapatunay na ang mga plano ng gusali o estruktura ay sumusunod sa fire safety standards bago magsimula ang konstruksyon.'
        },
        {
          question: 'Ano ang FSIC para sa Occupancy?',
          answer: 'Ang FSIC (Fire Safety Inspection Certificate) para sa Occupancy ay inilalabas ng Bureau of Fire Protection matapos ang inspeksyon. Kinukumpirma nito na ligtas okupahan ang isang gusali at sumusunod ito sa mga fire safety requirement bago ito magamit ng tao.'
        },
        {
          question: 'Ano ang FSIC para sa Business?',
          answer: 'Ang FSIC para sa Business ay inilalabas din ng Bureau of Fire Protection. Pinapatunayan nito na ang isang negosyo ay sumusunod sa mga fire safety regulasyon, at karaniwan itong kailangan sa pag-aapply o pag-renew ng business permit.'
        },
        {
          question: 'Ano ang mga kinakailangan upang maging Fire Officer?',
          answer: [
            'Dapat ay mamamayang Pilipino',
            'Dapat may Bachelor\'s degree',
            'Dapat pumasa sa Civil Service Exam (Fire Officer Exam)',
            'Dapat pumasa sa height at physical fitness requirements',
            'Dapat may mabuting asal at karakter',
            'Dapat pumasa sa medical, psychological, at physical tests',
            'Dapat makumpleto ang training (hal. Basic Firefighter Course)'
          ]
        },
        {
          question: 'Ano ang dapat gawin kapag may Kitchen Fire?',
          answer: [
            'Manatiling kalmado',
            'Patayin ang kalan kung ligtas itong gawin',
            'Huwag gumamit ng tubig lalo na kung langis o grasa ang nasusunog',
            'Takpan ang apoy gamit ang takip o fire blanket',
            'Gumamit ng fire extinguisher (Class K o ABC)',
            'Kung lumalaki ang apoy, lumikas agad',
            'Tumawag sa emergency services'
          ]
        },
        {
          question: 'Paano mag-report ng Fire Emergency?',
          answer: [
            'Tawagan ang emergency hotline 911 sa Pilipinas',
            'Magbigay ng malinaw na detalye: eksaktong lokasyon, uri ng sunog, at kung may na-trap o nasaktan',
            'Manatili sa linya at sundin ang mga tagubilin',
            'Maari ring direktang kontakin ang pinakamalapit na Bureau of Fire Protection station'
          ]
        }
      ]
    }
  }
};

const LandingContentContext = createContext();

const mergeWithDefaults = (candidate = {}) => ({
  hero: { ...DEFAULT_LANDING_CONTENT.hero, ...(candidate.hero || {}) },
  about: { ...DEFAULT_LANDING_CONTENT.about, ...(candidate.about || {}) },
  contact: { ...DEFAULT_LANDING_CONTENT.contact, ...(candidate.contact || {}) },
  process: {
    english: {
      ...DEFAULT_LANDING_CONTENT.process.english,
      ...(candidate.process?.english || {}),
      processSteps:
        candidate.process?.english?.processSteps || DEFAULT_LANDING_CONTENT.process.english.processSteps
    },
    tagalog: {
      ...DEFAULT_LANDING_CONTENT.process.tagalog,
      ...(candidate.process?.tagalog || {}),
      processSteps:
        candidate.process?.tagalog?.processSteps || DEFAULT_LANDING_CONTENT.process.tagalog.processSteps
    }
  },
  faq: {
    english: {
      ...DEFAULT_LANDING_CONTENT.faq.english,
      ...(candidate.faq?.english || {}),
      faqs: candidate.faq?.english?.faqs || DEFAULT_LANDING_CONTENT.faq.english.faqs
    },
    tagalog: {
      ...DEFAULT_LANDING_CONTENT.faq.tagalog,
      ...(candidate.faq?.tagalog || {}),
      faqs: candidate.faq?.tagalog?.faqs || DEFAULT_LANDING_CONTENT.faq.tagalog.faqs
    }
  }
});

const readStoredContent = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LANDING_CONTENT;

    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch (error) {
    console.error('Error loading landing content from storage:', error);
    return DEFAULT_LANDING_CONTENT;
  }
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLandingContent = () => {
  const context = useContext(LandingContentContext);
  if (!context) {
    throw new Error('useLandingContent must be used within LandingContentProvider');
  }
  return context;
};

export const LandingContentProvider = ({ children }) => {
  const { currentUser } = useUser();
  const [content, setContentState] = useState(() => readStoredContent());
  const [loadingContent, setLoadingContent] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const syncFromDb = async () => {
      const { data, error } = await getLandingContentFromDb();

      if (!isMounted) return;

      if (error) {
        // Keep cached/default content when DB is not available.
        setLoadingContent(false);
        return;
      }

      if (data) {
        const merged = mergeWithDefaults(data);
        setContentState(merged);

        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch (storageError) {
          console.error('Error caching landing content from DB:', storageError);
        }
      }

      setLoadingContent(false);
    };

    syncFromDb();

    return () => {
      isMounted = false;
    };
  }, []);

  const setContent = async (nextContent) => {
    const merged = mergeWithDefaults(nextContent);
    setContentState(merged);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
      console.error('Error saving landing content to storage:', error);
    }

    const { error } = await saveLandingContentToDb({
      content: merged,
      updatedBy: currentUser?.admin_id || null,
    });

    return { error };
  };

  const resetContent = async () => {
    setContentState(DEFAULT_LANDING_CONTENT);

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing landing content cache:', error);
    }

    const { error } = await saveLandingContentToDb({
      content: DEFAULT_LANDING_CONTENT,
      updatedBy: currentUser?.admin_id || null,
    });

    return { error };
  };

  const value = {
    content,
    setContent,
    resetContent,
    defaults: DEFAULT_LANDING_CONTENT,
    loadingContent,
  };

  return <LandingContentContext.Provider value={value}>{children}</LandingContentContext.Provider>;
};

// Lets admin preview screens (e.g. the Quick Preview) feed unsaved draft
// content into the real landing-page components without touching the
// live saved content or triggering a database write.
export const LandingContentPreviewProvider = ({ content, children }) => {
  const value = useMemo(
    () => ({
      content: mergeWithDefaults(content),
      setContent: async () => ({ error: null }),
      resetContent: async () => ({ error: null }),
      defaults: DEFAULT_LANDING_CONTENT,
      loadingContent: false,
    }),
    [content]
  );

  return <LandingContentContext.Provider value={value}>{children}</LandingContentContext.Provider>;
};
