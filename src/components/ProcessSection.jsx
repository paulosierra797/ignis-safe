import { useState } from 'react'
import './ProcessSection.css'

export default function ProcessSection() {
  const [isTagalog, setIsTagalog] = useState(false)

  const content = {
    english: {
      title: 'STEPS TO PROCESS YOUR FSIC & FSEC ONLINE APPLICATION',
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
      title: 'MGA HAKBANG SA PAGPROSESO NG IYONG FSIC & FSEC ONLINE APPLICATION',
      processSteps: [
        {
          title: 'PROSESO NG PAGGAWA NG ACCOUNT',
          steps: [
            { num: 1, text: 'Pumunta sa fsic.bfp.com o i-scan ang QR code.' },
            { num: 2, text: 'I-click ang "Register Now", punan ang kinakailangang impormasyon, at piliin ang "Create Account."' },
            { num: 3, text: 'I-check ang iyong email at i-click ang "Verify Email" o ang account validation link.' }
          ]
        },
        {
          title: 'PROSESO NG APPLICATION',
          steps: [
            { num: 1, text: 'Mag-Log In gamit ang iyong account.' },
            { num: 2, text: 'Sa dashboard, i-click ang "Apply Now" at piliin ang uri ng aplikasyon (FSEC, FSIC, Occupancy, Business, Clearances).' },
            { num: 3, text: 'Punan ang form at i-click ang "Submit Application."' },
            { num: 4, text: 'I-upload ang mga kinakailangang dokumento at pindutin ang "Confirm Submission."' },
            { num: 5, text: 'I-check ang status sa Applications button.' }
          ]
        },
        {
          title: 'PAYMENT PROCESS',
          steps: [
            { num: 1, text: 'Sa Applications, tingnan ang status at ang Review Fees. Susuriin ng assessor ang iyong aplikasyon at itatakda ang kaukulang bayarin.' },
            { num: 2, text: 'Kapag na-review na, i-click ang "Capture Payment Details."' },
            { num: 3, text: 'Piliin ang "Pay Whole Amount" at pumili ng payment gateway (PayMaya o Bank Transfer lamang).' },
            { num: 4, text: 'I-click ang "Proceed with Payment," piliin ang paraan ng pagbabayad, pagkatapos ay "Pay Now" at "Yes, Proceed."' }
          ]
        },
        {
          title: 'DOWNLOAD E-COPY',
          steps: [
            { num: 1, text: 'Para makuha ang iyong certificate o clearance, pumunta sa iyong application at i-click ang "Issued Documents."' }
          ]
        }
      ]
    }
  }

  const currentContent = isTagalog ? content.tagalog : content.english

  return (
    <section className="process">
      <div className="process-container">
        <h2>{currentContent.title}</h2>
        <button 
          className="tagalog-btn"
          onClick={() => setIsTagalog(!isTagalog)}
        >
          {isTagalog ? 'ENGLISH' : 'TAGALOG'}
        </button>
        
        <div className="process-grid">
          {currentContent.processSteps.map((section, idx) => (
            <div key={idx} className="process-column">
              <h3>{section.title}</h3>
              <ol className="steps-list">
                {section.steps.map((step) => (
                  <li key={step.num}>
                    <span className="step-number">{step.num}</span>
                    <span className="step-text">{step.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
