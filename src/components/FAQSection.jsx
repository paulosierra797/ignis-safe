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
          question: 'How can I request a fire safety inspection for my home?',
          answer: 'You can request an inspection through our online portal or contact us directly at the provided phone number.'
        },
        {
          question: 'How can I perceive fees differently?',
          answer: [
            'Avoid overloading outlets',
            'Keep flammable items from heat sources',
            'Install smoke detectors and extinguishers',
            'Maintain emergency exits'
          ]
        },
        {
          question: 'How do I report a fire emergency?',
          answer: 'Immediately call our emergency hotline at the number provided in the contact section.'
        }
      ]
    },
    tagalog: {
      title: 'MGA MADALAS ITANONG',
      faqs: [
        {
          question: 'Paano ako makakahingi ng fire safety inspection para sa aking tahanan?',
          answer: 'Maaari kang humiling ng inspection sa pamamagitan ng aming online portal o direktang makipag-ugnayan sa amin sa nakalagay na numero ng telepono.'
        },
        {
          question: 'Paano ko maiwawasan ang panganib ng sunog?',
          answer: [
            'Iwasan ang labis na pagkarga ng mga outlet',
            'Panatilihing malayo ang mga madaling masunog na bagay sa pinagmumulan ng init',
            'Mag-install ng smoke detectors at fire extinguishers',
            'Panatilihing malinis at accessible ang emergency exits'
          ]
        },
        {
          question: 'Paano ko irereport ang emergency na sunog?',
          answer: 'Agad na tawagan ang aming emergency hotline sa numerong nakalagay sa contact section.'
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
