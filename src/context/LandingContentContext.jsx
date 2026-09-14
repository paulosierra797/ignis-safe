import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from './UserContext';
import { getLandingUiCopy, LANDING_LANGUAGE_STORAGE_KEY, normalizeDasmarinasText } from '../utils/landingLanguage';
import { getPublicLandingContent } from '../utils/publicContentService';

const STORAGE_KEY = 'ignis_landing_content_v1';
const MAX_BANNER_PHOTOS = 5;
const loadLandingContentService = () => import('../utils/landingContentService');

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_LANDING_CONTENT = {
  hero: {
    title: 'Protecting lives, property and community',
    lead: 'Welcome to the BFP Dasmariñas City Fire Station portal.',
    description:
      'Access fire safety services, public advisories, contact details, and FSIC and FSEC application guidance.',
    tagalog: {
      title: 'Pagprotekta sa buhay, ari-arian, at komunidad',
      lead: 'Maligayang pagdating sa portal ng BFP Dasmariñas City Fire Station.',
      description:
        'Alamin ang mga serbisyo sa kaligtasan sa sunog, pampublikong abiso, detalye sa pakikipag-ugnayan, at gabay sa aplikasyon ng FSIC at FSEC.'
    },
    photos: []
  },
  about: {
    title: 'About us',
    intro:
      'The Dasmariñas Fire Station is committed to protecting lives, safety, and the environment through professional and expertise, emergency medical services, and disaster response. Our dedicated team of firefighters and first responders serve around the clock to ensure the safety of our community. We take pride in serving the public with a unwavering commitment towards emergency response and community service.',
    missionTitle: 'Our Mission',
    missionText:
      'We commit to prevent and suppress destructive fires, investigate its causes; enforce Fire Code and other related laws; respond to man-made and natural disasters and other emergencies.',
    visionTitle: 'Our Vision',
    visionText: 'A modern fire service fully capable of ensuring a fire safe nation by 2034.',
    tagalog: {
      title: 'Tungkol sa amin',
      intro:
        'Ang Dasmariñas Fire Station ay nakatuon sa pangangalaga ng buhay, kaligtasan, at kapaligiran sa pamamagitan ng propesyonal na pagtugon sa emergency, serbisyong medikal, at disaster response. Ang aming mga bumbero at first responder ay handang maglingkod sa komunidad sa lahat ng oras.'
    }
  },
  contact: {
    title: 'CONTACT INFORMATION',
    emergencyTitle: 'EMERGENCY HOTLINE OF BFP:',
    landlinePrimary: '(046) 884-6131',
    landlineSecondary: '416-0875',
    mobile: '0995 336 9534',
    email: 'dasmarinasfire@gmail.com',
    facebookLabel: 'BFP-Dasmariñas FS Cavite',
    facebookUrl: 'https://www.facebook.com/GOLF.E207/',
    tagalog: {
      title: 'IMPORMASYON SA PAKIKIPAG-UGNAYAN',
      emergencyTitle: 'EMERGENCY HOTLINE NG BFP:'
    }
  },
  trust: {
    english: {
      eyebrow: 'Trust and accessibility',
      title: 'Official information made easier to access',
      intro: 'Use verified BFP guidance, clear emergency directions, and public services designed to work across devices.',
      items: [
        {
          title: 'Official BFP information',
          text: 'Public advisories and service guidance come from the Dasmariñas City Fire Station.'
        },
        {
          title: 'Accessible public service',
          text: 'Readable contrast, keyboard-friendly controls, and responsive layouts support more visitors.'
        },
        {
          title: 'Privacy-aware messaging',
          text: 'Visitor messages are used only to manage the requested conversation and should never include passwords.'
        }
      ]
    },
    tagalog: {
      eyebrow: 'Tiwala at accessibility',
      title: 'Mas madaling ma-access ang opisyal na impormasyon',
      intro: 'Gamitin ang beripikadong gabay ng BFP, malinaw na direksyon sa emergency, at mga serbisyong gumagana sa iba\'t ibang device.',
      items: [
        {
          title: 'Opisyal na impormasyon ng BFP',
          text: 'Ang mga pampublikong abiso at gabay sa serbisyo ay mula sa Dasmariñas City Fire Station.'
        },
        {
          title: 'Accessible na pampublikong serbisyo',
          text: 'Ang malinaw na contrast, keyboard-friendly na controls, at responsive layout ay tumutulong sa mas maraming bisita.'
        },
        {
          title: 'Paggalang sa privacy ng mensahe',
          text: 'Ginagamit lamang ang mensahe ng bisita para sa hinihinging pag-uusap at hindi dapat maglaman ng password.'
        }
      ]
    }
  },
  process: {
    english: {
      title: 'Fire Safety Inspection Certificate (FSIC) & Fire Safety Evaluation Clearance (FSEC) Online Application',
      processSteps: [
        {
          title: 'ACCOUNT CREATION PROCESS',
          steps: [
            { num: 1, text: 'Go to fsis.e-bfp.com or scan the QR code below.' },
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
            { num: 1, text: 'Pumunta sa fsis.e-bfp.com o i-scan ang QR code sa ibaba.' },
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
      title: 'Frequently asked questions',
      faqs: [
        {
          question: 'What is FSEC?',
          answer: 'A Fire Safety Evaluation Clearance (FSEC) is issued after the BFP determines that proposed building plans comply with the Fire Code of the Philippines and its implementing rules. It is generally required before the Office of the Building Official grants a building permit for new construction, renovation, alteration, or modification.'
        },
        {
          question: 'What is FSIC for Occupancy?',
          answer: 'A Fire Safety Inspection Certificate (FSIC) for Occupancy is issued after inspection confirms that required fire-safety construction, protection, and warning systems are properly installed and compliant. It supports the application for a Certificate of Occupancy and does not replace other permits required by the city or other agencies.'
        },
        {
          question: 'What is FSIC for Business?',
          answer: 'An FSIC for Business confirms that a business establishment meets applicable fire-safety requirements after evaluation and inspection. It is commonly required for a new business permit or renewal. The applicable process may differ for new businesses, renewals, and establishments with an existing valid FSIC.'
        },
        {
          question: 'How do I apply for and track an FSEC or FSIC online?',
          answer: [
            'Open the official FSIS portal linked from this website and create or sign in to your verified account.',
            'Choose the correct application type, complete every required field, and upload the requested documents.',
            'Monitor the application status, review the official fee assessment, and follow the available payment instructions.',
            'Keep your reference number and official receipts. Download the issued clearance or certificate only from your application record.'
          ]
        },
        {
          question: 'What documents and fees will I need?',
          answer: [
            'Requirements depend on the application type and the building, occupancy, or business involved.',
            'FSEC applications commonly require signed and sealed plans, calculations, specifications, and the prescribed application form. FSIC applications may require prior clearances and proof that required fire-protection systems are installed and maintained.',
            'Fire Code fees are assessed after review. Check the latest BFP Citizen’s Charter, the official FSIS checklist, or confirm with the Dasmariñas City Fire Station before submitting.'
          ]
        },
        {
          question: 'What are the requirements to be a Fire Officer?',
          answer: [
            'Qualifications can change by vacancy and current BFP and Civil Service rules, so the official recruitment announcement is controlling.',
            'Applicants are commonly required to be Filipino citizens, hold a Bachelor’s degree, possess the required eligibility, and meet the stated age, character, health, and physical-fitness standards.',
            'Document screening, medical and psychological evaluation, physical tests, background checks, and required training may form part of the selection process.'
          ]
        },
        {
          question: 'What to do in case of Kitchen Fire?',
          answer: [
            'Turn off the heat only if you can do so without reaching through flames.',
            'For a small pan fire, slide a metal lid or baking sheet over the pan and leave it covered until completely cool.',
            'Never pour water on burning oil or grease, and never carry the burning pan outside.',
            'Use an appropriate Class K extinguisher if trained and you have a clear exit behind you. If the fire grows, evacuate, close the door, and call 911.'
          ]
        },
        {
          question: 'How to report a Fire Emergency?',
          answer: [
            'Move to a safe location and call 911 immediately. You may also call the published Dasmariñas City Fire Station hotline.',
            'State the exact address, nearby landmarks, what is burning, and whether anyone may be trapped or injured.',
            'Warn others and evacuate. Stay on the line, answer the dispatcher’s questions, and do not re-enter the building.'
          ]
        },
        {
          question: 'What information should I provide when calling about a fire?',
          answer: [
            'Give the complete address, barangay, nearest landmark, and best access route for fire trucks.',
            'Describe what is burning, the visible size of the fire or smoke, and any hazards such as LPG tanks, fuel, chemicals, or electrical equipment.',
            'Report trapped, missing, injured, elderly, child, or mobility-limited occupants. Give your name and callback number and follow the dispatcher’s instructions.'
          ]
        },
        {
          question: 'How do I use a fire extinguisher safely?',
          answer: [
            'Use an extinguisher only for a small, contained fire when the correct extinguisher is available, emergency services have been called, and a clear exit remains behind you.',
            'Remember PASS: Pull the pin, Aim at the base of the fire, Squeeze the handle, and Sweep from side to side.',
            'If the fire does not go out immediately, the room fills with smoke, or your exit becomes unsafe, stop and evacuate.'
          ]
        },
        {
          question: 'What should I do during a smoke-filled evacuation?',
          answer: [
            'Stay low where the air is clearer and move toward the nearest safe exit. Check a closed door for heat before opening it.',
            'Do not use elevators. Close doors behind you when possible to slow smoke and fire spread.',
            'Go to the agreed assembly point, call 911, account for household members, and never return inside until authorities declare it safe.'
          ]
        },
        {
          question: 'Can the IGNIS SAFE mobile app replace calling 911?',
          answer: 'No. IGNIS SAFE provides fire-safety lessons, simulations, progress tracking, and public information. It is not an emergency dispatch channel. During a fire or life-threatening emergency, move to safety and call 911 immediately.'
        }
      ]
    },
    tagalog: {
      title: 'Mga madalas itanong',
      faqs: [
        {
          question: 'Ano ang FSEC?',
          answer: 'Ang Fire Safety Evaluation Clearance (FSEC) ay inilalabas kapag natukoy ng BFP na ang proposed building plans ay sumusunod sa Fire Code of the Philippines at implementing rules nito. Karaniwan itong kailangan bago magbigay ang Office of the Building Official ng building permit para sa bagong construction, renovation, alteration, o modification.'
        },
        {
          question: 'Ano ang FSIC para sa Occupancy?',
          answer: 'Ang Fire Safety Inspection Certificate (FSIC) para sa Occupancy ay inilalabas matapos makumpirma sa inspeksyon na maayos na nailagay at sumusunod ang kinakailangang fire-safety construction, protection, at warning systems. Sinusuportahan nito ang aplikasyon para sa Certificate of Occupancy at hindi nito pinapalitan ang ibang permit na hinihingi ng lungsod o ibang ahensya.'
        },
        {
          question: 'Ano ang FSIC para sa Business?',
          answer: 'Ang FSIC para sa Business ay nagpapatunay na natutugunan ng isang business establishment ang naaangkop na fire-safety requirements matapos ang evaluation at inspection. Karaniwan itong kailangan para sa bagong business permit o renewal. Maaaring magkaiba ang proseso para sa bagong negosyo, renewal, at establishment na may valid na FSIC.'
        },
        {
          question: 'Paano mag-apply at mag-track ng FSEC o FSIC online?',
          answer: [
            'Buksan ang opisyal na FSIS portal na naka-link sa website na ito at gumawa o mag-sign in sa verified account.',
            'Piliin ang tamang application type, kumpletuhin ang lahat ng field, at i-upload ang hinihinging dokumento.',
            'Subaybayan ang application status, tingnan ang opisyal na fee assessment, at sundin ang available na payment instructions.',
            'Itago ang reference number at official receipts. I-download lamang ang clearance o certificate mula sa iyong application record.'
          ]
        },
        {
          question: 'Anong mga dokumento at bayarin ang kailangan?',
          answer: [
            'Nakadepende ang requirements sa uri ng aplikasyon at sa building, occupancy, o business na sakop nito.',
            'Karaniwang kailangan sa FSEC ang prescribed application form at signed at sealed plans, calculations, at specifications. Sa FSIC, maaaring kailanganin ang naunang clearances at patunay na naka-install at nama-maintain ang kinakailangang fire-protection systems.',
            'Ang Fire Code fees ay ina-assess matapos ang review. Tingnan ang pinakabagong BFP Citizen’s Charter at opisyal na FSIS checklist, o mag-confirm sa Dasmariñas City Fire Station bago magsumite.'
          ]
        },
        {
          question: 'Ano ang mga kinakailangan upang maging Fire Officer?',
          answer: [
            'Maaaring magbago ang qualifications ayon sa vacancy at kasalukuyang BFP at Civil Service rules, kaya ang opisyal na recruitment announcement ang dapat sundin.',
            'Karaniwang kailangang mamamayang Pilipino, may Bachelor’s degree, may kinakailangang eligibility, at pasado sa nakasaad na age, character, health, at physical-fitness standards.',
            'Maaaring kabilang sa selection process ang document screening, medical at psychological evaluation, physical tests, background check, at required training.'
          ]
        },
        {
          question: 'Ano ang dapat gawin kapag may Kitchen Fire?',
          answer: [
            'Patayin lamang ang init kung magagawa ito nang hindi inaabot o dinaraanan ang apoy.',
            'Para sa maliit na apoy sa kawali, dahan-dahang takpan ito ng metal lid o baking sheet at huwag alisin hanggang ganap na lumamig.',
            'Huwag kailanman buhusan ng tubig ang nasusunog na mantika o grasa, at huwag dalhin sa labas ang nasusunog na kawali.',
            'Gumamit ng angkop na Class K extinguisher kung trained at may malinaw na exit sa likod mo. Kapag lumalaki ang apoy, lumikas, isara ang pinto, at tumawag sa 911.'
          ]
        },
        {
          question: 'Paano mag-report ng Fire Emergency?',
          answer: [
            'Pumunta sa ligtas na lugar at tumawag agad sa 911. Maaari ring tawagan ang nakalathalang hotline ng Dasmariñas City Fire Station.',
            'Sabihin ang eksaktong address, kalapit na landmark, kung ano ang nasusunog, at kung may taong maaaring na-trap o nasaktan.',
            'Bigyan ng babala ang iba at lumikas. Manatili sa linya, sagutin ang tanong ng dispatcher, at huwag bumalik sa loob.'
          ]
        },
        {
          question: 'Anong impormasyon ang dapat ibigay kapag nagre-report ng sunog?',
          answer: [
            'Ibigay ang kumpletong address, barangay, pinakamalapit na landmark, at pinakamadaling ruta para sa fire trucks.',
            'Ilarawan kung ano ang nasusunog, gaano kalaki ang nakikitang apoy o usok, at kung may LPG tank, gasolina, kemikal, o electrical equipment.',
            'Sabihin kung may na-trap, nawawala, nasaktan, bata, nakatatanda, o taong may limitadong mobility. Ibigay ang pangalan at callback number at sundin ang dispatcher.'
          ]
        },
        {
          question: 'Paano ligtas na gumamit ng fire extinguisher?',
          answer: [
            'Gumamit lamang para sa maliit at kontroladong apoy kapag tama ang extinguisher, natawagan na ang emergency services, at may malinaw na exit sa likod mo.',
            'Tandaan ang PASS: Pull ang pin, Aim sa base ng apoy, Squeeze ang handle, at Sweep pakaliwa at pakanan.',
            'Kapag hindi agad namatay ang apoy, napupuno ng usok ang silid, o nalalagay sa panganib ang exit, huminto at lumikas.'
          ]
        },
        {
          question: 'Ano ang dapat gawin kapag mausok ang evacuation route?',
          answer: [
            'Manatiling mababa kung saan mas malinaw ang hangin at pumunta sa pinakamalapit na ligtas na exit. Suriin muna kung mainit ang saradong pinto bago buksan.',
            'Huwag gumamit ng elevator. Isara ang mga pinto sa likod mo kung kaya upang mapabagal ang pagkalat ng apoy at usok.',
            'Pumunta sa napagkasunduang assembly point, tumawag sa 911, bilangin ang mga kasama, at huwag bumalik hanggang ideklarang ligtas ng awtoridad.'
          ]
        },
        {
          question: 'Maaari bang ipalit sa pagtawag sa 911 ang IGNIS SAFE mobile app?',
          answer: 'Hindi. Ang IGNIS SAFE ay para sa fire-safety lessons, simulations, progress tracking, at pampublikong impormasyon. Hindi ito emergency dispatch channel. Kapag may sunog o panganib sa buhay, pumunta sa ligtas na lugar at tumawag agad sa 911.'
        }
      ]
    }
  },
  layout: {
    sections: ['hero', 'trust', 'mobile-app', 'announcements', 'process', 'about', 'contact', 'faq'],
    hidden: []
  },
  media: {
    brandLogo: null,
    aboutPhoto: null,
    contactPhoto: null,
    mobileLearningPhoto: null,
    mobileSplashPhoto: null
  },
  mobileRelease: {
    version: '1.0.0 (build 1)',
    size: '223.91 MB',
    compatibility: 'Android 7.1+',
    architecture: '64-bit ARM',
    format: 'APK',
    releaseDate: 'September 1, 2026',
    checksum: '5BA0AE8C9BCEEE54F177CD29ED69291E2CA80F1065633339D9FFAE36CE6CEA56'
  },
  copy: {
    english: {
      ...getLandingUiCopy('english'),
      brandAgency: 'Bureau of Fire Protection',
      brandStation: 'Dasmariñas City Fire Station'
    },
    tagalog: {
      ...getLandingUiCopy('tagalog'),
      brandAgency: 'Bureau of Fire Protection',
      brandStation: 'Dasmariñas City Fire Station'
    }
  }
};

const LandingContentContext = createContext();
const PREVIOUS_FILIPINO_HERO_TITLE = 'Pinangangalagaan ang buhay, ari-arian, at komunidad';

const normalizeHeroPhotos = (photos) => (
  Array.isArray(photos)
    ? photos
        .filter((photo) => photo && typeof photo === 'object' && photo.url)
        .slice(0, MAX_BANNER_PHOTOS)
        .map((photo, index) => ({
          id: photo.id || `banner-photo-${index + 1}`,
          url: photo.url,
          path: photo.path || '',
          alt: photo.alt || `Main banner photo ${index + 1}`,
          fileName: photo.fileName || '',
          size: Number(photo.size || 0),
          uploadedAt: photo.uploadedAt || '',
        }))
    : []
);

const normalizeCopyObject = (value) => {
  if (typeof value === 'string') return normalizeDasmarinasText(value);
  if (Array.isArray(value)) return value.map(normalizeCopyObject);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizeCopyObject(child)])
  );
};

const mergeFaqEntries = (candidateEntries, defaultEntries) => {
  if (!Array.isArray(candidateEntries) || candidateEntries.length === 0) {
    return defaultEntries;
  }

  const normalizeQuestion = (value) => String(value || '').trim().toLowerCase();
  const defaultQuestions = new Set(
    defaultEntries.map((entry) => normalizeQuestion(entry.question))
  );
  const customEntries = candidateEntries.filter(
    (entry) => !defaultQuestions.has(normalizeQuestion(entry?.question))
  );

  return [...defaultEntries, ...customEntries];
};

const normalizeStationEmail = (value) => {
  const email = String(value || DEFAULT_LANDING_CONTENT.contact.email).trim();
  return email.toLowerCase() === 'dasmariasfire@gmail.com'
    ? DEFAULT_LANDING_CONTENT.contact.email
    : email;
};

const LANDING_SECTION_IDS = DEFAULT_LANDING_CONTENT.layout.sections;

const normalizeLandingLayout = (layout) => {
  const requestedSections = Array.isArray(layout?.sections) ? layout.sections : [];
  const sections = [
    ...requestedSections.filter((id, index) => (
      LANDING_SECTION_IDS.includes(id) && requestedSections.indexOf(id) === index
    )),
    ...LANDING_SECTION_IDS.filter((id) => !requestedSections.includes(id))
  ];

  return {
    sections,
    hidden: Array.isArray(layout?.hidden)
      ? layout.hidden.filter((id) => LANDING_SECTION_IDS.includes(id))
      : []
  };
};

const mergeWithDefaults = (candidate = {}) => ({
  hero: {
    ...DEFAULT_LANDING_CONTENT.hero,
    ...(candidate.hero || {}),
    title: normalizeDasmarinasText(candidate.hero?.title ?? DEFAULT_LANDING_CONTENT.hero.title),
    lead: normalizeDasmarinasText(candidate.hero?.lead ?? DEFAULT_LANDING_CONTENT.hero.lead),
    description: normalizeDasmarinasText(candidate.hero?.description ?? DEFAULT_LANDING_CONTENT.hero.description),
    tagalog: normalizeCopyObject({
      ...DEFAULT_LANDING_CONTENT.hero.tagalog,
      ...(candidate.hero?.tagalog || {}),
      title: candidate.hero?.tagalog?.title === PREVIOUS_FILIPINO_HERO_TITLE
        ? DEFAULT_LANDING_CONTENT.hero.tagalog.title
        : candidate.hero?.tagalog?.title ?? DEFAULT_LANDING_CONTENT.hero.tagalog.title
    }),
    photos: normalizeHeroPhotos(candidate.hero?.photos)
  },
  about: normalizeCopyObject({
    ...DEFAULT_LANDING_CONTENT.about,
    ...(candidate.about || {}),
    tagalog: {
      title: normalizeDasmarinasText(candidate.about?.tagalog?.title ?? DEFAULT_LANDING_CONTENT.about.tagalog.title),
      intro: normalizeDasmarinasText(candidate.about?.tagalog?.intro ?? DEFAULT_LANDING_CONTENT.about.tagalog.intro)
    }
  }),
  contact: {
    ...DEFAULT_LANDING_CONTENT.contact,
    ...(candidate.contact || {}),
    email: normalizeStationEmail(candidate.contact?.email),
    title: normalizeDasmarinasText(candidate.contact?.title ?? DEFAULT_LANDING_CONTENT.contact.title),
    emergencyTitle: normalizeDasmarinasText(candidate.contact?.emergencyTitle ?? DEFAULT_LANDING_CONTENT.contact.emergencyTitle),
    facebookLabel: normalizeDasmarinasText(candidate.contact?.facebookLabel ?? DEFAULT_LANDING_CONTENT.contact.facebookLabel),
    tagalog: normalizeCopyObject({
      ...DEFAULT_LANDING_CONTENT.contact.tagalog,
      ...(candidate.contact?.tagalog || {})
    })
  },
  trust: normalizeCopyObject({
    english: {
      ...DEFAULT_LANDING_CONTENT.trust.english,
      ...(candidate.trust?.english || {}),
      items: candidate.trust?.english?.items || DEFAULT_LANDING_CONTENT.trust.english.items
    },
    tagalog: {
      ...DEFAULT_LANDING_CONTENT.trust.tagalog,
      ...(candidate.trust?.tagalog || {}),
      items: candidate.trust?.tagalog?.items || DEFAULT_LANDING_CONTENT.trust.tagalog.items
    }
  }),
  process: normalizeCopyObject({
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
  }),
  faq: normalizeCopyObject({
    english: {
      ...DEFAULT_LANDING_CONTENT.faq.english,
      ...(candidate.faq?.english || {}),
      title: candidate.faq?.english?.title === 'FREQUENTLY ASKED QUESTIONS'
        ? DEFAULT_LANDING_CONTENT.faq.english.title
        : candidate.faq?.english?.title || DEFAULT_LANDING_CONTENT.faq.english.title,
      faqs: mergeFaqEntries(candidate.faq?.english?.faqs, DEFAULT_LANDING_CONTENT.faq.english.faqs)
    },
    tagalog: {
      ...DEFAULT_LANDING_CONTENT.faq.tagalog,
      ...(candidate.faq?.tagalog || {}),
      title: candidate.faq?.tagalog?.title === 'MGA MADALAS ITANONG'
        ? DEFAULT_LANDING_CONTENT.faq.tagalog.title
        : candidate.faq?.tagalog?.title || DEFAULT_LANDING_CONTENT.faq.tagalog.title,
      faqs: mergeFaqEntries(candidate.faq?.tagalog?.faqs, DEFAULT_LANDING_CONTENT.faq.tagalog.faqs)
    }
  }),
  layout: normalizeLandingLayout(candidate.layout),
  media: {
    ...DEFAULT_LANDING_CONTENT.media,
    ...(candidate.media || {})
  },
  mobileRelease: normalizeCopyObject({
    ...DEFAULT_LANDING_CONTENT.mobileRelease,
    ...(candidate.mobileRelease || {})
  }),
  copy: normalizeCopyObject({
    english: {
      ...DEFAULT_LANDING_CONTENT.copy.english,
      ...(candidate.copy?.english || {})
    },
    tagalog: {
      ...DEFAULT_LANDING_CONTENT.copy.tagalog,
      ...(candidate.copy?.tagalog || {})
    }
  })
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

const readStoredLanguage = () => {
  try {
    const stored = localStorage.getItem(LANDING_LANGUAGE_STORAGE_KEY);
    return stored === 'tagalog' ? 'tagalog' : 'english';
  } catch {
    return 'english';
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
  const location = useLocation();
  const shouldSyncContent = location.pathname === '/'
    || location.pathname === '/organizational-chart'
    || location.pathname.endsWith('/announcements')
    || location.pathname === '/dashboard/landing-page-editor';
  const [content, setContentState] = useState(() => readStoredContent());
  const [loadingContent, setLoadingContent] = useState(shouldSyncContent);
  const [language, setLanguageState] = useState(() => readStoredLanguage());

  useEffect(() => {
    document.documentElement.lang = language === 'tagalog' ? 'fil' : 'en';

    try {
      localStorage.setItem(LANDING_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Keep the selected language for this session when storage is unavailable.
    }
  }, [language]);

  const setLanguage = (nextLanguage) => {
    setLanguageState(nextLanguage === 'tagalog' ? 'tagalog' : 'english');
  };

  const toggleLanguage = () => {
    setLanguageState((current) => (current === 'english' ? 'tagalog' : 'english'));
  };

  useEffect(() => {
    if (!shouldSyncContent) return undefined;

    let isMounted = true;

    const syncFromDb = async () => {
      const { data, error } = await getPublicLandingContent();

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
  }, [shouldSyncContent]);

  const setContent = async (nextContent) => {
    const merged = mergeWithDefaults(nextContent);
    setContentState(merged);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
      console.error('Error saving landing content to storage:', error);
    }

    const { saveLandingContentToDb } = await loadLandingContentService();
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

    const { saveLandingContentToDb } = await loadLandingContentService();
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
    language,
    setLanguage,
    toggleLanguage,
  };

  return <LandingContentContext.Provider value={value}>{children}</LandingContentContext.Provider>;
};

// Lets the admin's visual editor feed an unpublished draft into the real
// landing-page components without touching saved public content.
export const LandingContentPreviewProvider = ({ content, children }) => {
  const [language, setLanguageState] = useState('english');
  const value = useMemo(
    () => ({
      content: mergeWithDefaults(content),
      setContent: async () => ({ error: null }),
      resetContent: async () => ({ error: null }),
      defaults: DEFAULT_LANDING_CONTENT,
      loadingContent: false,
      language,
      setLanguage: (nextLanguage) => setLanguageState(nextLanguage === 'tagalog' ? 'tagalog' : 'english'),
      toggleLanguage: () => setLanguageState((current) => (current === 'english' ? 'tagalog' : 'english')),
    }),
    [content, language]
  );

  return <LandingContentContext.Provider value={value}>{children}</LandingContentContext.Provider>;
};
