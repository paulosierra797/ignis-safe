import { useState } from 'react'
import './FAQSection.css'

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(null)
  const [isTagalog, setIsTagalog] = useState(false)

  const content = {
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
            'Must have a Bachelor’s degree',
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
            'Dapat may Bachelor’s degree',
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
            'Maaari ring direktang kontakin ang pinakamalapit na Bureau of Fire Protection station'
          ]
        }
      ]
    }
  }

  const currentContent = isTagalog ? content.tagalog : content.english

  const toggleFAQ = (index) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="faq" id="faq">
      <div className="faq-container">
        <h2>{currentContent.title}</h2>
        <button 
          className="tagalog-btn"
          onClick={() => setIsTagalog(!isTagalog)}
        >
          {isTagalog ? 'ENGLISH' : 'TAGALOG'}
        </button>

        <div className="faq-list">
          {currentContent.faqs.map((faq, index) => (
            <div
              key={index}
              className={`faq-item ${openIndex === index ? 'open' : ''}`}
            >
              <button
                className="faq-question"
                onClick={() => toggleFAQ(index)}
              >
                <span className="faq-number">0{index + 1}</span>
                <span>{faq.question}</span>
                <span className="toggle-icon">{openIndex === index ? '−' : '+'}</span>
              </button>
              
              {openIndex === index && (
                <div className="faq-answer">
                  {Array.isArray(faq.answer) ? (
                    <ul>
                      {faq.answer.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>{faq.answer}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
