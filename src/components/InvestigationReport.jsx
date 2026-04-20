import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './InvestigationReport.css';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import { saveInvestigationDraft, submitInvestigationReport } from '../utils/reportsService';

export default function InvestigationReport({
  onClose,
  reportType,
  initialDraftReportId = null,
  initialFormValues = null
}) {
  const { currentUser } = useUser();
  const stepTitles = useMemo(() => {
    if (reportType === 'fireOperations') {
      return ['Alarm & Dispatch', 'Status & Occupancy', 'Resources', 'Personnel & Narrative'];
    }
    if (reportType === 'spotInvestigation') {
      return ['Memorandum', 'Incident Details', 'Investigation Details', 'Disposition'];
    }

    return ['Memorandum', 'Incident Details', 'Facts and Discussion', 'Findings'];
  }, [reportType]);

  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [draftReportId, setDraftReportId] = useState(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });
  const [formValues, setFormValues] = useState({
    memorandumFor: '',
    memorandumDate: '',
    memorandumSubject: '',
    fireStation: 'Dasmarinas City Fire Station, Dasmarinas City, Cavite, Region IV-A',
    fireAlarmReceived: '',
    fireCaller: '',
    fireCallerOffice: '',
    firePersonnelOnDuty: '',
    fireUnits: [
      {
        engineDispatched: '',
        timeDispatched: '',
        timeArrived: '',
        responseTime: '',
        timeReturned: '',
        waterRefilled: '',
        gasConsumed: ''
      },
      {
        engineDispatched: '',
        timeDispatched: '',
        timeArrived: '',
        responseTime: '',
        timeReturned: '',
        waterRefilled: '',
        gasConsumed: ''
      },
      {
        engineDispatched: '',
        timeDispatched: '',
        timeArrived: '',
        responseTime: '',
        timeReturned: '',
        waterRefilled: '',
        gasConsumed: ''
      }
    ],
    fireAlarmStatusFirstResponder: '',
    fireAlarmStatusAugmenting: '',
    fireTimeUnderControl: '',
    fireTimeDeclaredOut: '',
    fireOccupancyType: '',
    fireDistanceKm: '',
    fireGeneralDescription: '',
    fireCasualtyCivilianInjured: '',
    fireCasualtyCivilianDeath: '',
    fireCasualtyFirefighterInjured: '',
    fireCasualtyFirefighterDeath: '',
    fireAlarmStatusDeclared: [
      { label: '1ST ALARM', time: '', commander: '' },
      { label: '2ND ALARM', time: '', commander: '' },
      { label: '3RD ALARM', time: '', commander: '' },
      { label: '4TH ALARM', time: '', commander: '' },
      { label: '5TH ALARM', time: '', commander: '' },
      { label: 'TASK FORCE ALPHA', time: '', commander: '' },
      { label: 'TASK FORCE BRAVO', time: '', commander: '' },
      { label: 'TASK FORCE CHARLIE', time: '', commander: '' },
      { label: 'TASK FORCE DELTA', time: '', commander: '' },
      { label: 'TASK FORCE ECHO', time: '', commander: '' },
      { label: 'TASK FORCE HOTEL', time: '', commander: '' },
      { label: 'TASK FORCE INDIA', time: '', commander: '' }
    ],
    fireExtinguishingAgents: [
      { qty: '', type: '' },
      { qty: '', type: '' }
    ],
    fireRopeLadderUsed: [
      { type: '', length: '' },
      { type: '', length: '' }
    ],
    fireHoseLines: [
      { nr: '', type: '', totalLt: '' },
      { nr: '', type: '', totalLt: '' },
      { nr: '', type: '', totalLt: '' }
    ],
    fireBreathingApparatus: [
      { nr: '', type: '', total: '' },
      { nr: '', type: '', total: '' }
    ],
    fireDutyPersonnel: [
      { rankName: '', designation: '', remarks: '' },
      { rankName: '', designation: '', remarks: '' },
      { rankName: '', designation: '', remarks: '' },
      { rankName: '', designation: '', remarks: '' }
    ],
    fireInstructionSketchImage: '',
    fireDetailsNarrative: '',
    fireProblemsEncountered: '',
    fireObservations: '',
    firePreparedBy: '',
    fireNotedBy: '',
    sirDtpo: '',
    sirInvolved: '',
    sirEstablishment: '',
    sirOwner: '',
    sirOccupant: '',
    sirFatality: '',
    sirInjured: '',
    sirEstimatedDamage: '',
    sirTimeFireStarted: '',
    sirTimeFireOut: '',
    sirAlarm: '',
    sirDetails: '',
    sirDisposition: '',
    sirNotedBy: '',
    sirApprovedBy: '',
    incidentPlace: '',
    incidentAlarmDate: '',
    incidentEstablishment: '',
    incidentVictims: '',
    incidentDamage: '',
    incidentOrigin: '',
    incidentCause: '',
    factsCase: '',
    factsDiscussion: '',
    findings: '',
    recommendation: ''
  });

  useEffect(() => {
    if (initialFormValues && typeof initialFormValues === 'object') {
      setFormValues((prev) => ({ ...prev, ...initialFormValues }));
    }

    if (initialDraftReportId) {
      setDraftReportId(initialDraftReportId);
    }
  }, [initialFormValues, initialDraftReportId]);

  useEffect(() => {
    if (!submitMessage.text) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setSubmitMessage({ type: '', text: '' });
    }, 2500);

    return () => clearTimeout(timeoutId);
  }, [submitMessage]);

  const reportMeta = useMemo(() => {
    const map = {
      fireOperations: {
        title: 'Fire Operations Report',
        pdfTitle: 'AFTER FIRE OPERATIONS REPORT',
        tableTitle: 'AFTER FIRE OPERATIONS REPORT',
        fileName: 'fire-operations-report.pdf'
      },
      finalInvestigation: {
        title: 'Final Investigation Report',
        pdfTitle: 'FINAL INVESTIGATION REPORT (F.I.R.)',
        tableTitle: 'FINAL INVESTIGATION REPORT\n(F.I.R.)',
        fileName: 'final-investigation-report.pdf'
      },
      spotInvestigation: {
        title: 'Spot Investigation Report',
        pdfTitle: 'SPOT INVESTIGATION REPORT (S.I.R.)',
        tableTitle: 'SPOT INVESTIGATION REPORT\n(S.I.R.)',
        fileName: 'spot-investigation-report.pdf'
      },
      default: {
        title: 'Investigation Report',
        pdfTitle: 'FINAL INVESTIGATION REPORT (F.I.R.)',
        tableTitle: 'FINAL INVESTIGATION REPORT\n(F.I.R.)',
        fileName: 'investigation-report.pdf'
      }
    };

    return map[reportType] || map.default;
  }, [reportType]);

  const steps = useMemo(
    () =>
      stepTitles.map((title, index) => ({
        title,
        status:
          showPreview || index < activeStepIndex
            ? 'Completed'
            : index === activeStepIndex
            ? 'In Progress'
            : 'Pending',
        isActive: !showPreview && index === activeStepIndex,
        isCompleted: showPreview || index < activeStepIndex
      })),
    [activeStepIndex, showPreview, stepTitles]
  );

  useEffect(() => {
    setActiveStepIndex(0);
    setShowPreview(false);
  }, [reportType]);

  const handleChange = (field) => (event) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSketchUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFormValues((prev) => ({
        ...prev,
        fireInstructionSketchImage: ''
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFormValues((prev) => ({
        ...prev,
        fireInstructionSketchImage: String(reader.result || '')
      }));
    };
    reader.readAsDataURL(file);
  };

  const updateArrayField = (field, index, key, value) => {
    setFormValues((prev) => {
      const list = [...prev[field]];
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [field]: list };
    });
  };

  const handleNext = () => {
    if (activeStepIndex >= stepTitles.length - 1) {
      setShowPreview(true);
      return;
    }

    setActiveStepIndex((prev) => Math.min(prev + 1, stepTitles.length - 1));
  };

  const handlePrevious = () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }

    setActiveStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const buildPdf = async () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 48;
    let cursorY = 48;

    // Load and add logos
    const logoY = 30;
    const defaultLogoSize = 50;
    let logoBottomY = logoY + defaultLogoSize;

    try {
      // Load BFP logo (left)
      const bfpLogoResponse = await fetch('/src/assets/bfp_logo.png');
      const bfpLogoBlob = await bfpLogoResponse.blob();
      const bfpLogoData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(bfpLogoBlob);
      });

      // Load BFP Dasma logo (right)
      const dasmaLogoResponse = await fetch('/src/assets/bfp_dasma.png');
      const dasmaLogoBlob = await dasmaLogoResponse.blob();
      const dasmaLogoData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(dasmaLogoBlob);
      });

      if (reportType === 'spotInvestigation') {
        const centerX = pageWidth / 2;
        const slotOffset = 112;
        const leftCenterX = centerX - slotOffset;
        const middleCenterX = centerX;
        const rightCenterX = centerX + slotOffset;
        const leftSize = 44;
        const middleRadius = 20;
        const rightWidth = 28;
        const rightHeight = 36;

        doc.addImage(bfpLogoData, 'PNG', leftCenterX - leftSize / 2, logoY, leftSize, leftSize);
        doc.addImage(dasmaLogoData, 'PNG', rightCenterX - rightWidth / 2, logoY + 3, rightWidth, rightHeight);

        // Circular placeholder to mimic the third emblem in the official layout.
        doc.setDrawColor(0, 0, 0);
        doc.circle(middleCenterX, logoY + leftSize / 2, middleRadius, 'S');
        doc.setFont('times', 'normal');
        doc.setFontSize(5);
        doc.text('Municipality', middleCenterX, logoY + leftSize / 2 - 2, { align: 'center' });
        doc.text('Logo', middleCenterX, logoY + leftSize / 2 + 4, { align: 'center' });

        logoBottomY = logoY + leftSize;
      } else {
        doc.addImage(bfpLogoData, 'PNG', marginX, logoY, defaultLogoSize, defaultLogoSize);
        doc.addImage(
          dasmaLogoData,
          'PNG',
          pageWidth - marginX - defaultLogoSize,
          logoY,
          defaultLogoSize,
          defaultLogoSize
        );
        logoBottomY = logoY + defaultLogoSize;
      }
    } catch (error) {
      console.error('Error loading logos:', error);
    }

    cursorY = logoBottomY + 10;

    if (reportType === 'spotInvestigation') {
      const centerX = pageWidth / 2;

      doc.setFont('times', 'normal');
      doc.setFontSize(9);
      doc.text('Republic of the Philippines', centerX, cursorY, { align: 'center' });
      cursorY += 11;
      doc.text('Department of the Interior and Local Government', centerX, cursorY, { align: 'center' });
      cursorY += 11;
      doc.setFont('times', 'bold');
      doc.text('BUREAU OF FIRE PROTECTION NATIONAL HEADQUARTERS', centerX, cursorY, {
        align: 'center'
      });
      cursorY += 11;
      doc.setFont('times', 'normal');
      doc.text('Agham Road, Bago Bantay, Quezon City', centerX, cursorY, {
        align: 'center'
      });
      cursorY += 11;
      doc.text('(Regional/Provincial/District/City/Municipal Letterhead)', centerX, cursorY, {
        align: 'center'
      });
      cursorY += 18;

      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.text('MEMORANDUM', centerX, cursorY, { align: 'center' });
      cursorY += 18;
    } else {
      doc.setFont('times', 'normal');
      doc.setFontSize(9);
      doc.text('Republic of the Philippines', pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 12;
      doc.text('Department of the Interior and Local Government', pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 12;
      doc.setFont('times', 'bold');
      doc.text('Bureau of Fire Protection', pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 12;
      doc.setFont('times', 'normal');
      doc.setFontSize(8);
      doc.text('(INSERT REGION)', pageWidth / 2, cursorY, { align: 'center' });
      cursorY += 10;
      doc.text('(INSERT ADDRESS)', pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 10;
      doc.text('(INSERT CONTACT NUMBER / EMAIL ADDRESS)', pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 20;

      doc.setFont('times', 'bold');
      doc.setFontSize(11);
      doc.text(reportMeta.pdfTitle, pageWidth / 2, cursorY, {
        align: 'center'
      });
      cursorY += 18;
    }

    if (reportType === 'fireOperations') {
      doc.setFont('times', 'normal');
      doc.setFontSize(9);
      doc.text('Explicitly stipulated are the details of the fire incident that transpired on or about', marginX, cursorY);
      cursorY += 16;

      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        columnStyles: {
          0: { cellWidth: 180, halign: 'left' },
          1: { cellWidth: pageWidth - marginX * 2 - 180, halign: 'left' }
        },
        body: [
          ['Alarm received (Time)', formValues.fireAlarmReceived || '-'],
          ['Caller / Reported / Transmitted by', formValues.fireCaller || '-'],
          ['Office / Address of the Caller', formValues.fireCallerOffice || '-'],
          ['Personnel on duty who received the alarm', formValues.firePersonnelOnDuty || '-']
        ]
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 8,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [[
          'ENGINE DISPATCHED',
          'TIME DISPATCHED',
          'TIME ARRIVED AT FIRE SCENE',
          'RESPONSE TIME (min)',
          'TIME RETURNED TO BASE',
          'WATER TANK REFILLED (GAL)',
          'GAS CONSUMED (L)'
        ]],
        body: formValues.fireUnits.map((unit) => [
          unit.engineDispatched || '-',
          unit.timeDispatched || '-',
          unit.timeArrived || '-',
          unit.responseTime || '-',
          unit.timeReturned || '-',
          unit.waterRefilled || '-',
          unit.gasConsumed || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        columnStyles: {
          0: { cellWidth: 200, halign: 'left' },
          1: { cellWidth: pageWidth - marginX * 2 - 200, halign: 'left' }
        },
        body: [
          ['Alarm Status Upon Arrival - First Responder', formValues.fireAlarmStatusFirstResponder || '-'],
          ['Alarm Status Upon Arrival - Augmenting Team', formValues.fireAlarmStatusAugmenting || '-'],
          ['Time / Date Under Control', formValues.fireTimeUnderControl || '-'],
          ['Time / Date Declared Fire Out', formValues.fireTimeDeclaredOut || '-'],
          ['Type of Occupancy', formValues.fireOccupancyType || '-'],
          ['Approx Distance from Fire Station (Km)', formValues.fireDistanceKm || '-'],
          ['General Description of Structure/s Involved', formValues.fireGeneralDescription || '-']
        ]
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Casualty Reported', 'Injured', 'Death']],
        body: [
          ['Civilian', formValues.fireCasualtyCivilianInjured || '-', formValues.fireCasualtyCivilianDeath || '-'],
          ['Firefighter', formValues.fireCasualtyFirefighterInjured || '-', formValues.fireCasualtyFirefighterDeath || '-']
        ]
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 8,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Time Alarm Status Declared', 'Time', 'Ground Commander']],
        body: formValues.fireAlarmStatusDeclared.map((row) => [
          row.label,
          row.time || '-',
          row.commander || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Extinguishing Agent Used', 'Type/Kind']],
        body: formValues.fireExtinguishingAgents.map((row) => [
          row.qty || '-',
          row.type || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Rope and Ladder Used', 'Length']],
        body: formValues.fireRopeLadderUsed.map((row) => [
          row.type || '-',
          row.length || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Hose Line Used (Nr.)', 'Type/Kind', 'Total Lt']],
        body: formValues.fireHoseLines.map((row) => [
          row.nr || '-',
          row.type || '-',
          row.totalLt || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 12;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 8,
          cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Breathing Apparatus Used', 'Nr.', 'Type/Kind', 'TOTAL']],
        body: formValues.fireBreathingApparatus.map((row) => [
          'BT',
          row.nr || '-',
          row.type || '-',
          row.total || '-'
        ])
      });

      doc.addPage();
      cursorY = 72;
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX },
        theme: 'grid',
        styles: {
          font: 'times',
          fontSize: 9,
          cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
          lineColor: [90, 90, 90],
          lineWidth: 0.6
        },
        head: [['Duty Personnel at the Fire Scene', 'Designation', 'Remarks']],
        body: formValues.fireDutyPersonnel.map((row) => [
          row.rankName || '-',
          row.designation || '-',
          row.remarks || '-'
        ])
      });

      cursorY = doc.lastAutoTable.finalY + 18;
      doc.setFont('times', 'bold');
      doc.text('Instruction/Sketch of the Fire Operation (should be attached):', marginX, cursorY);
      cursorY += 12;
      if (formValues.fireInstructionSketchImage) {
        const maxWidth = pageWidth - marginX * 2;
        const maxHeight = 220;
        try {
          doc.addImage(
            formValues.fireInstructionSketchImage,
            'JPEG',
            marginX,
            cursorY,
            maxWidth,
            maxHeight
          );
          cursorY += maxHeight + 14;
        } catch (error) {
          doc.setFont('times', 'normal');
          doc.text('Attached image could not be rendered.', marginX, cursorY);
          cursorY += 18;
        }
      } else {
        doc.setFont('times', 'normal');
        doc.text('No image attached.', marginX, cursorY);
        cursorY += 18;
      }

      doc.setFont('times', 'bold');
      doc.text('Details (Narrative):', marginX, cursorY);
      cursorY += 12;
      doc.setFont('times', 'normal');
      const narrativeLines = doc.splitTextToSize(formValues.fireDetailsNarrative || '-', pageWidth - marginX * 2);
      doc.text(narrativeLines, marginX, cursorY);
      cursorY += narrativeLines.length * 12 + 14;

      doc.setFont('times', 'bold');
      doc.text('Problems Encountered during Operation:', marginX, cursorY);
      cursorY += 12;
      doc.setFont('times', 'normal');
      const problemsLines = doc.splitTextToSize(formValues.fireProblemsEncountered || '-', pageWidth - marginX * 2);
      doc.text(problemsLines, marginX, cursorY);
      cursorY += problemsLines.length * 12 + 14;

      doc.setFont('times', 'bold');
      doc.text('Observations/Recommendations:', marginX, cursorY);
      cursorY += 12;
      doc.setFont('times', 'normal');
      const observationsLines = doc.splitTextToSize(formValues.fireObservations || '-', pageWidth - marginX * 2);
      doc.text(observationsLines, marginX, cursorY);

      cursorY += observationsLines.length * 12 + 30;
      doc.setFont('times', 'bold');
      doc.text('Prepared by:', marginX, cursorY);
      doc.text('Noted by:', pageWidth / 2 + 20, cursorY);
      cursorY += 36;
      doc.setFont('times', 'normal');
      doc.text(formValues.firePreparedBy || '____________________________', marginX, cursorY);
      doc.text(formValues.fireNotedBy || '____________________________', pageWidth / 2 + 20, cursorY);

      return doc;
    }

    if (reportType === 'spotInvestigation') {
      const labelX = marginX;
      const colonX = marginX + 78;
      const valueX = marginX + 90;
      const detailsWidth = pageWidth - marginX * 2;

      const writeMemoLine = (label, value) => {
        doc.setFont('times', 'bold');
        doc.setFontSize(10);
        doc.text(label, labelX, cursorY);
        doc.text(':', colonX, cursorY);
        doc.setFont('times', 'normal');
        doc.text(value || '-', valueX, cursorY);
        cursorY += 18;
      };

      writeMemoLine('FOR', formValues.memorandumFor);
      writeMemoLine('SUBJECT', formValues.memorandumSubject || 'Spot Investigation Report (SIR)');

      doc.setFont('times', 'bold');
      doc.text('DATE', labelX, cursorY);
      doc.text(':', colonX, cursorY);
      doc.setFont('times', 'normal');
      doc.text(formValues.memorandumDate || '', valueX, cursorY);
      doc.line(valueX, cursorY + 2, pageWidth - marginX, cursorY + 2);
      cursorY += 18;

      const writeIncidentLine = (label, value, note) => {
        doc.setFont('times', 'bold');
        doc.setFontSize(9);
        doc.text(label, labelX, cursorY);
        doc.setFont('times', 'normal');
        doc.text(':', marginX + 115, cursorY);
        doc.text(value || '-', marginX + 124, cursorY);
        if (note) {
          const noteLines = doc.splitTextToSize(note, 220);
          doc.setFontSize(8);
          doc.text(noteLines, pageWidth - marginX - 220, cursorY);
          doc.setFontSize(9);
        }
        cursorY += 13;
      };

      writeIncidentLine('DTPO', formValues.sirDtpo, '(Date, Time and Place of Occurrence)');
      writeIncidentLine('INVOLVED', formValues.sirInvolved, '(Type of Occupancy / Involved structure)');
      writeIncidentLine('NAME OF ESTABLISHMENT', formValues.sirEstablishment, '(Complete name of involved establishment)');
      writeIncidentLine('OWNER', formValues.sirOwner, '(Owner of the property gutted by fire)');
      writeIncidentLine('OCCUPANT', formValues.sirOccupant, '(Occupant of the property gutted by fire)');
      writeIncidentLine('CASUALTY  Fatality', formValues.sirFatality, '(No. of person who died)');
      writeIncidentLine('CASUALTY  Injured', formValues.sirInjured, '(No. of person who are injured)');
      writeIncidentLine('ESTIMATED DAMAGE', formValues.sirEstimatedDamage, '(Initial aggregated damage in terms of Peso)');
      writeIncidentLine('TIME FIRE STARTED', formValues.sirTimeFireStarted, '(Exact time the fire started)');
      writeIncidentLine('TIME OF FIRE OUT', formValues.sirTimeFireOut, '(Exact time the fire was declared fire out)');
      writeIncidentLine('ALARM', formValues.sirAlarm, '(Highest fire alarm tapped by the FGC)');

      cursorY += 8;
      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.text('DETAILS OF INVESTIGATION:', marginX, cursorY);
      cursorY += 12;
      doc.setFont('times', 'normal');
      doc.setFontSize(8.5);
      const detailsGuidance = [
        'This section should contain:',
        '  - A complete narration of the details of the fire incident as gathered by the Fire Arson',
        '    Investigator (FAI) during actual response.',
        '  - Number of establishments and / or affected establishments.',
        '  - Estimated area in square meters and estimated amount of damage.',
        '  - Location of fatalities and initial details as to identity.',
        '  - Other initial information about the involved establishment and the fire incident.'
      ].join('\n');
      doc.text(doc.splitTextToSize(detailsGuidance, detailsWidth), marginX, cursorY);
      cursorY += 68;

      const detailsLines = doc.splitTextToSize(formValues.sirDetails || '-', detailsWidth);
      doc.setFontSize(9);
      doc.text(detailsLines, marginX, cursorY);
      cursorY += Math.min(detailsLines.length * 10 + 12, 48);

      doc.setFont('times', 'bold');
      doc.setFontSize(10);
      doc.text('DISPOSITION:', marginX, cursorY);
      cursorY += 12;
      doc.setFont('times', 'normal');
      doc.setFontSize(8.5);
      const dispositionGuidance = [
        'This section should contain:',
        '  - The disposition and assessment of the FAI regarding the case.',
        '  - May also contain whether the case will be turned over to the higher office.'
      ].join('\n');
      doc.text(doc.splitTextToSize(dispositionGuidance, detailsWidth), marginX, cursorY);
      cursorY += 36;

      doc.setFontSize(9);
      const dispositionLines = doc.splitTextToSize(formValues.sirDisposition || '-', detailsWidth);
      doc.text(dispositionLines, marginX, cursorY);

      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFont('times', 'italic');
      doc.setFontSize(8);
      doc.text('(Name and signature of the FAI)', pageWidth - marginX - 140, pageHeight - 64);
      doc.setFont('times', 'normal');
      doc.setFontSize(6.5);
      doc.text('BFP-QSF-FAID-002 Rev. 02 (02.03.25) 1 of 2', marginX, pageHeight - 20);

      doc.addPage();
      const page2Height = doc.internal.pageSize.getHeight();
      cursorY = 120;

      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.text('Noted By:', marginX + 20, cursorY);
      cursorY += 34;
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.text(
        formValues.sirNotedBy || '(Name and signature of the Chief of the Intelligence and Investigation Unit)',
        marginX + 20,
        cursorY
      );

      cursorY += 56;
      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.text('Approved for Submission:', marginX + 20, cursorY);
      cursorY += 34;
      doc.setFont('times', 'normal');
      doc.setFontSize(10);
      doc.text(
        formValues.sirApprovedBy || '(Name and Signature of the Head of Office)',
        marginX + 20,
        cursorY
      );

      doc.setFontSize(6.5);
      doc.text('BFP-QSF-FAID-002 Rev. 02 (02.03.25) 2 of 2', marginX, page2Height - 20);

      return doc;
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: marginX, right: marginX },
      theme: 'grid',
      styles: {
        font: 'times',
        fontSize: 9,
        cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
        lineColor: [90, 90, 90],
        lineWidth: 0.6
      },
      tableLineColor: [90, 90, 90],
      tableLineWidth: 0.6,
      columnStyles: {
        0: { cellWidth: 250, halign: 'left' },
        1: { cellWidth: pageWidth - marginX * 2 - 250, halign: 'left' }
      },
      body: [
        [
          reportMeta.tableTitle,
          formValues.fireStation || '-'
        ],
        [
          `01. PLACE OF FIRE:\n${formValues.incidentPlace || '-'}`,
          `02. TIME AND DATE OF ALARM:\n${formValues.incidentAlarmDate || '-'}`
        ],
        [
          `03. ESTABLISHMENT BURNED:\n${formValues.incidentEstablishment || '-'}\n\n05. DAMAGE TO PROPERTY:\n${
            formValues.incidentDamage || '-'
          }`,
          `04. FIRE VICTIMS:\n${formValues.incidentVictims || '-'}`
        ],
        [
          {
            content: `06. ORIGIN OF FIRE: ${formValues.incidentOrigin || '-'}`,
            colSpan: 2
          }
        ],
        [
          {
            content: `07. CAUSE OF FIRE: ${formValues.incidentCause || '-'}`,
            colSpan: 2
          }
        ]
      ],
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 0 && data.column.index === 0) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
        }
      }
    });

    cursorY = doc.lastAutoTable.finalY + 14;
    doc.setFont('times', 'bold');
    doc.text('08. SUBSTANTIATING DOCUMENTS:', marginX, cursorY);
    cursorY += 12;
    doc.setFont('times', 'normal');
    const docsText =
      'Documents to be gathered to completely facilitate the conduct of investigation in relation to Chapter VII, B.2 of BFP SOP NR. 2023-001.';
    const docsLines = doc.splitTextToSize(docsText, pageWidth - marginX * 2);
    doc.text(docsLines, marginX, cursorY);
    cursorY += docsLines.length * 12 + 12;

    doc.setFont('times', 'bold');
    doc.text('FACTS OF THE CASE', marginX, cursorY);
    cursorY += 12;
    doc.setFont('times', 'normal');
    const factsLines = doc.splitTextToSize(formValues.factsCase || '-', pageWidth - marginX * 2);
    doc.text(factsLines, marginX, cursorY);
    cursorY += factsLines.length * 12 + 14;

    doc.setFont('times', 'bold');
    doc.text('DISCUSSION', marginX, cursorY);
    cursorY += 12;
    doc.setFont('times', 'normal');
    const discussionLines = doc.splitTextToSize(
      formValues.factsDiscussion || '-',
      pageWidth - marginX * 2
    );
    doc.text(discussionLines, marginX, cursorY);
    cursorY += discussionLines.length * 12 + 14;

    doc.setFont('times', 'bold');
    doc.text('FINDINGS', marginX, cursorY);
    cursorY += 12;
    doc.setFont('times', 'normal');
    const findingsLines = doc.splitTextToSize(formValues.findings || '-', pageWidth - marginX * 2);
    doc.text(findingsLines, marginX, cursorY);
    cursorY += findingsLines.length * 12 + 14;

    doc.setFont('times', 'bold');
    doc.text('RECOMMENDATION', marginX, cursorY);
    cursorY += 12;
    doc.setFont('times', 'normal');
    const recommendationLines = doc.splitTextToSize(
      formValues.recommendation || '-',
      pageWidth - marginX * 2
    );
    doc.text(recommendationLines, marginX, cursorY);

    return doc;
  };

  useEffect(() => {
    if (!showPreview) {
      setPdfUrl('');
      return undefined;
    }

    let isMounted = true;

    (async () => {
      const doc = await buildPdf();
      if (!isMounted) return;
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    })();

    return () => {
      isMounted = false;
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [showPreview, formValues]);

  const handlePrint = async () => {
    const doc = await buildPdf();
    const blobUrl = URL.createObjectURL(doc.output('blob'));
    const printWindow = window.open(blobUrl);
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.focus();
        printWindow.print();
      });
    }
  };

  const handleSaveDraft = async () => {
    if (isSavingDraft || isSubmitting) {
      return;
    }

    if (!currentUser?.admin_id) {
      setSubmitMessage({ type: 'error', text: 'Unable to save draft: missing user session.' });
      return;
    }

    setIsSavingDraft(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      const categoryMap = {
        fireOperations: 'After Fire Operations',
        spotInvestigation: 'Spot Investigation',
        finalInvestigation: 'Final Investigation'
      };

      const displayName = [currentUser.first_name, currentUser.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      const createdByName = displayName || currentUser.name || currentUser.email || 'Personnel User';

      const { data, error } = await saveInvestigationDraft({
        reportType,
        title: reportMeta.title,
        category: categoryMap[reportType] || reportMeta.title,
        reportPayload: formValues,
        createdBy: currentUser.admin_id,
        createdByName,
        reportId: draftReportId
      });

      if (error) {
        setSubmitMessage({ type: 'error', text: `Draft save failed: ${error}` });
        return;
      }

      if (data?.report_id) {
        setDraftReportId(data.report_id);
      }

      setSubmitMessage({ type: 'success', text: 'Draft saved successfully.' });
    } catch (error) {
      setSubmitMessage({ type: 'error', text: `Draft save failed: ${error.message}` });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!currentUser?.admin_id) {
      setSubmitMessage({ type: 'error', text: 'Unable to submit: missing user session.' });
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage({ type: '', text: '' });

    try {
      const doc = await buildPdf();
      const pdfBlob = doc.output('blob');

      const categoryMap = {
        fireOperations: 'After Fire Operations',
        spotInvestigation: 'Spot Investigation',
        finalInvestigation: 'Final Investigation'
      };

      const displayName = [currentUser.first_name, currentUser.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      const createdByName = displayName || currentUser.name || currentUser.email || 'Personnel User';

      const { error } = await submitInvestigationReport({
        reportType,
        title: reportMeta.title,
        category: categoryMap[reportType] || reportMeta.title,
        reportPayload: formValues,
        pdfBlob,
        pdfFileName: reportMeta.fileName,
        createdBy: currentUser.admin_id,
        createdByName,
        reportId: draftReportId
      });

      if (error) {
        setSubmitMessage({ type: 'error', text: `Submit failed: ${error}` });
        return;
      }

      setSubmitMessage({ type: 'success', text: 'Report submitted successfully. Intel Unit can now monitor this report.' });
      setTimeout(() => {
        onClose?.();
      }, 900);
    } catch (error) {
      setSubmitMessage({ type: 'error', text: `Submit failed: ${error.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToReports = () => {
    const shouldLeave = window.confirm(
      'Are you sure you want to go back to reports? Your inputted data may not be saved.'
    );

    if (!shouldLeave) {
      return;
    }

    onClose?.();
  };

  return (
    <div className="investigation-page">
      <Sidebar variant="personnel" />

      <div className="investigation-main">
        <PageHeader
          title={reportMeta.title}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          variant="personnel"
        />

        <div className="investigation-toolbar">
          <button className="report-close-btn" onClick={handleBackToReports}>
            Back to Reports
          </button>
        </div>

        <section className="investigation-report">
          {!showPreview && (
        <>
          <div className="investigation-steps">
            {steps.map((step) => (
              <div
                key={step.title}
                className={`step-card${step.isActive ? ' active' : ''}${
                  step.isCompleted ? ' completed' : ''
                }`}
              >
                <p className="step-title">{step.title}</p>
                <p className="step-status">{step.status}</p>
              </div>
            ))}
          </div>

          <div className="investigation-card">
            <div className="card-header">
              <h3>
                {reportType === 'fireOperations'
                  ? activeStepIndex === 0
                    ? 'Alarm & Dispatch'
                    : activeStepIndex === 1
                    ? 'Status & Occupancy'
                    : activeStepIndex === 2
                    ? 'Resources'
                    : 'Personnel & Narrative'
                  : activeStepIndex === 0
                  ? 'Memorandum Details'
                  : activeStepIndex === 1
                  ? 'Incident Details'
                  : activeStepIndex === 2
                  ? reportType === 'spotInvestigation'
                    ? 'Investigation Details'
                    : 'Facts and Discussion'
                  : reportType === 'spotInvestigation'
                  ? 'Disposition'
                  : 'Findings'}
              </h3>
            </div>

            <div className="card-body">
              {activeStepIndex === 0 && reportType === 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-section">
                    <h4 className="section-title">Alarm Received</h4>
                    <div className="form-grid">
                      <div className="form-field">
                        <label htmlFor="fire-alarm-received">Alarm received (Time)</label>
                        <input
                          id="fire-alarm-received"
                          type="text"
                          value={formValues.fireAlarmReceived}
                          onChange={handleChange('fireAlarmReceived')}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="fire-caller">Caller / Reported / Transmitted by</label>
                        <input
                          id="fire-caller"
                          type="text"
                          value={formValues.fireCaller}
                          onChange={handleChange('fireCaller')}
                        />
                      </div>
                      <div className="form-field full-width">
                        <label htmlFor="fire-caller-office">Office / Address of the Caller</label>
                        <input
                          id="fire-caller-office"
                          type="text"
                          value={formValues.fireCallerOffice}
                          onChange={handleChange('fireCallerOffice')}
                        />
                      </div>
                      <div className="form-field full-width">
                        <label htmlFor="fire-personnel-duty">Personnel on duty who received the alarm</label>
                        <input
                          id="fire-personnel-duty"
                          type="text"
                          value={formValues.firePersonnelOnDuty}
                          onChange={handleChange('firePersonnelOnDuty')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Response Time</h4>
                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Engine Dispatched</span>
                        <span>Time Dispatched</span>
                        <span>Time Arrived</span>
                        <span>Response Time (min)</span>
                        <span>Time Returned</span>
                        <span>Water Refilled (gal)</span>
                        <span>Gas Consumed (L)</span>
                      </div>
                      {formValues.fireUnits.map((unit, index) => (
                        <div key={`unit-${index}`} className="table-row">
                          <input
                            type="text"
                            value={unit.engineDispatched}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'engineDispatched', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.timeDispatched}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'timeDispatched', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.timeArrived}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'timeArrived', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.responseTime}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'responseTime', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.timeReturned}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'timeReturned', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.waterRefilled}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'waterRefilled', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={unit.gasConsumed}
                            onChange={(e) =>
                              updateArrayField('fireUnits', index, 'gasConsumed', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStepIndex === 0 && reportType !== 'fireOperations' && (
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="memorandum-for">For</label>
                    <input
                      id="memorandum-for"
                      type="text"
                      placeholder="Investigation Officer"
                      value={formValues.memorandumFor}
                      onChange={handleChange('memorandumFor')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="memorandum-date">Date</label>
                    <input
                      id="memorandum-date"
                      type="date"
                      value={formValues.memorandumDate}
                      onChange={handleChange('memorandumDate')}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label htmlFor="memorandum-subject">Subject</label>
                    <input
                      id="memorandum-subject"
                      type="text"
                      placeholder={
                        reportType === 'spotInvestigation'
                          ? 'Spot Investigation Report (SIR)'
                          : reportType === 'fireOperations'
                          ? 'After Fire Operations Report'
                          : 'e.g. Final Investigation Report'
                      }
                      value={formValues.memorandumSubject}
                      onChange={handleChange('memorandumSubject')}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label htmlFor="fire-station">Fire station</label>
                    <input
                      id="fire-station"
                      type="text"
                      value={formValues.fireStation}
                      onChange={handleChange('fireStation')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 1 && reportType === 'spotInvestigation' && (
                <div className="form-grid">
                  <div className="form-field">
                    <label htmlFor="sir-dtpo">DTPO</label>
                    <input
                      id="sir-dtpo"
                      type="text"
                      placeholder="Date, Time and Place of Occurrence"
                      value={formValues.sirDtpo}
                      onChange={handleChange('sirDtpo')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-involved">Involved</label>
                    <input
                      id="sir-involved"
                      type="text"
                      placeholder="Type of occupancy / involved structure"
                      value={formValues.sirInvolved}
                      onChange={handleChange('sirInvolved')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-establishment">Name of Establishment</label>
                    <input
                      id="sir-establishment"
                      type="text"
                      value={formValues.sirEstablishment}
                      onChange={handleChange('sirEstablishment')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-owner">Owner</label>
                    <input
                      id="sir-owner"
                      type="text"
                      value={formValues.sirOwner}
                      onChange={handleChange('sirOwner')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-occupant">Occupant</label>
                    <input
                      id="sir-occupant"
                      type="text"
                      value={formValues.sirOccupant}
                      onChange={handleChange('sirOccupant')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-fatality">Casualty - Fatality</label>
                    <input
                      id="sir-fatality"
                      type="text"
                      value={formValues.sirFatality}
                      onChange={handleChange('sirFatality')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-injured">Casualty - Injured</label>
                    <input
                      id="sir-injured"
                      type="text"
                      value={formValues.sirInjured}
                      onChange={handleChange('sirInjured')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-damage">Estimated Damage</label>
                    <input
                      id="sir-damage"
                      type="text"
                      value={formValues.sirEstimatedDamage}
                      onChange={handleChange('sirEstimatedDamage')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-started">Time Fire Started</label>
                    <input
                      id="sir-started"
                      type="text"
                      value={formValues.sirTimeFireStarted}
                      onChange={handleChange('sirTimeFireStarted')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-out">Time of Fire Out</label>
                    <input
                      id="sir-out"
                      type="text"
                      value={formValues.sirTimeFireOut}
                      onChange={handleChange('sirTimeFireOut')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-alarm">Alarm</label>
                    <input
                      id="sir-alarm"
                      type="text"
                      value={formValues.sirAlarm}
                      onChange={handleChange('sirAlarm')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 1 && reportType !== 'spotInvestigation' && reportType !== 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-field">
                    <label htmlFor="incident-place">Place of fire</label>
                    <input
                      id="incident-place"
                      type="text"
                      value={formValues.incidentPlace}
                      onChange={handleChange('incidentPlace')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-alarm">Time and Date of Alarm</label>
                    <input
                      id="incident-alarm"
                      type="text"
                      value={formValues.incidentAlarmDate}
                      onChange={handleChange('incidentAlarmDate')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-establishment">Establishment Burned</label>
                    <input
                      id="incident-establishment"
                      type="text"
                      value={formValues.incidentEstablishment}
                      onChange={handleChange('incidentEstablishment')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-victims">Fire Victims</label>
                    <input
                      id="incident-victims"
                      type="text"
                      value={formValues.incidentVictims}
                      onChange={handleChange('incidentVictims')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-damage">Damage to property</label>
                    <input
                      id="incident-damage"
                      type="text"
                      value={formValues.incidentDamage}
                      onChange={handleChange('incidentDamage')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-origin">Origin of fire</label>
                    <input
                      id="incident-origin"
                      type="text"
                      value={formValues.incidentOrigin}
                      onChange={handleChange('incidentOrigin')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="incident-cause">Cause of fire</label>
                    <input
                      id="incident-cause"
                      type="text"
                      value={formValues.incidentCause}
                      onChange={handleChange('incidentCause')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 1 && reportType === 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-section">
                    <h4 className="section-title">Alarm Status</h4>
                    <div className="form-grid">
                      <div className="form-field">
                        <label htmlFor="fire-alarm-first">First Responder</label>
                        <input
                          id="fire-alarm-first"
                          type="text"
                          value={formValues.fireAlarmStatusFirstResponder}
                          onChange={handleChange('fireAlarmStatusFirstResponder')}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="fire-alarm-augmenting">Augmenting Team</label>
                        <input
                          id="fire-alarm-augmenting"
                          type="text"
                          value={formValues.fireAlarmStatusAugmenting}
                          onChange={handleChange('fireAlarmStatusAugmenting')}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="fire-under-control">Time/Date Under Control</label>
                        <input
                          id="fire-under-control"
                          type="text"
                          value={formValues.fireTimeUnderControl}
                          onChange={handleChange('fireTimeUnderControl')}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="fire-declared-out">Time/Date Declared Fire Out</label>
                        <input
                          id="fire-declared-out"
                          type="text"
                          value={formValues.fireTimeDeclaredOut}
                          onChange={handleChange('fireTimeDeclaredOut')}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Occupancy & Casualties</h4>
                    <div className="form-grid">
                      <div className="form-field">
                        <label htmlFor="fire-occupancy">Type of Occupancy</label>
                        <input
                          id="fire-occupancy"
                          type="text"
                          value={formValues.fireOccupancyType}
                          onChange={handleChange('fireOccupancyType')}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="fire-distance">Distance from Station (Km)</label>
                        <input
                          id="fire-distance"
                          type="text"
                          value={formValues.fireDistanceKm}
                          onChange={handleChange('fireDistanceKm')}
                        />
                      </div>
                      <div className="form-field full-width">
                        <label htmlFor="fire-description">General Description of Structure/s</label>
                        <input
                          id="fire-description"
                          type="text"
                          value={formValues.fireGeneralDescription}
                          onChange={handleChange('fireGeneralDescription')}
                        />
                      </div>
                    </div>
                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Casualty Reported</span>
                        <span>Injured</span>
                        <span>Death</span>
                      </div>
                      <div className="table-row">
                        <span>Civilian</span>
                        <input
                          type="text"
                          value={formValues.fireCasualtyCivilianInjured}
                          onChange={handleChange('fireCasualtyCivilianInjured')}
                        />
                        <input
                          type="text"
                          value={formValues.fireCasualtyCivilianDeath}
                          onChange={handleChange('fireCasualtyCivilianDeath')}
                        />
                      </div>
                      <div className="table-row">
                        <span>Firefighter</span>
                        <input
                          type="text"
                          value={formValues.fireCasualtyFirefighterInjured}
                          onChange={handleChange('fireCasualtyFirefighterInjured')}
                        />
                        <input
                          type="text"
                          value={formValues.fireCasualtyFirefighterDeath}
                          onChange={handleChange('fireCasualtyFirefighterDeath')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeStepIndex === 2 && reportType === 'spotInvestigation' && (
                <div className="form-stack">
                  <div className="form-field">
                    <label htmlFor="sir-details">Details of Investigation</label>
                    <textarea
                      id="sir-details"
                      rows={8}
                      value={formValues.sirDetails}
                      onChange={handleChange('sirDetails')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 2 && reportType !== 'spotInvestigation' && reportType !== 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-field">
                    <label htmlFor="facts-case">Facts of the Case</label>
                    <textarea
                      id="facts-case"
                      rows={6}
                      value={formValues.factsCase}
                      onChange={handleChange('factsCase')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="facts-discussion">Discussion</label>
                    <textarea
                      id="facts-discussion"
                      rows={6}
                      value={formValues.factsDiscussion}
                      onChange={handleChange('factsDiscussion')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 2 && reportType === 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-section">
                    <h4 className="section-title">Time Alarm Status Declared</h4>
                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Alarm</span>
                        <span>Time</span>
                        <span>Ground Commander</span>
                      </div>
                      {formValues.fireAlarmStatusDeclared.map((row, index) => (
                        <div key={`alarm-${row.label}`} className="table-row">
                          <span>{row.label}</span>
                          <input
                            type="text"
                            value={row.time}
                            onChange={(e) =>
                              updateArrayField('fireAlarmStatusDeclared', index, 'time', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.commander}
                            onChange={(e) =>
                              updateArrayField('fireAlarmStatusDeclared', index, 'commander', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Resources Used</h4>
                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Extinguishing Agent Qty</span>
                        <span>Type/Kind</span>
                      </div>
                      {formValues.fireExtinguishingAgents.map((row, index) => (
                        <div key={`agent-${index}`} className="table-row">
                          <input
                            type="text"
                            value={row.qty}
                            onChange={(e) =>
                              updateArrayField('fireExtinguishingAgents', index, 'qty', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.type}
                            onChange={(e) =>
                              updateArrayField('fireExtinguishingAgents', index, 'type', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Rope and Ladder Used</span>
                        <span>Length</span>
                      </div>
                      {formValues.fireRopeLadderUsed.map((row, index) => (
                        <div key={`rope-${index}`} className="table-row">
                          <input
                            type="text"
                            value={row.type}
                            onChange={(e) =>
                              updateArrayField('fireRopeLadderUsed', index, 'type', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.length}
                            onChange={(e) =>
                              updateArrayField('fireRopeLadderUsed', index, 'length', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Hose Line Used (Nr.)</span>
                        <span>Type/Kind</span>
                        <span>Total Lt</span>
                      </div>
                      {formValues.fireHoseLines.map((row, index) => (
                        <div key={`hose-${index}`} className="table-row">
                          <input
                            type="text"
                            value={row.nr}
                            onChange={(e) =>
                              updateArrayField('fireHoseLines', index, 'nr', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.type}
                            onChange={(e) =>
                              updateArrayField('fireHoseLines', index, 'type', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.totalLt}
                            onChange={(e) =>
                              updateArrayField('fireHoseLines', index, 'totalLt', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Breathing Apparatus (Nr.)</span>
                        <span>Type/Kind</span>
                        <span>Total</span>
                      </div>
                      {formValues.fireBreathingApparatus.map((row, index) => (
                        <div key={`breathing-${index}`} className="table-row">
                          <input
                            type="text"
                            value={row.nr}
                            onChange={(e) =>
                              updateArrayField('fireBreathingApparatus', index, 'nr', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.type}
                            onChange={(e) =>
                              updateArrayField('fireBreathingApparatus', index, 'type', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.total}
                            onChange={(e) =>
                              updateArrayField('fireBreathingApparatus', index, 'total', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeStepIndex === 3 && reportType === 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-section">
                    <h4 className="section-title">Duty Personnel at Fire Scene</h4>
                    <div className="form-table">
                      <div className="table-row table-head">
                        <span>Rank/Name</span>
                        <span>Designation</span>
                        <span>Remarks</span>
                      </div>
                      {formValues.fireDutyPersonnel.map((row, index) => (
                        <div key={`duty-${index}`} className="table-row">
                          <input
                            type="text"
                            value={row.rankName}
                            onChange={(e) =>
                              updateArrayField('fireDutyPersonnel', index, 'rankName', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.designation}
                            onChange={(e) =>
                              updateArrayField('fireDutyPersonnel', index, 'designation', e.target.value)
                            }
                          />
                          <input
                            type="text"
                            value={row.remarks}
                            onChange={(e) =>
                              updateArrayField('fireDutyPersonnel', index, 'remarks', e.target.value)
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Instruction / Sketch</h4>
                    <div className="form-field">
                      <input
                        type="file"
                        accept="image/*"
                        className="sketch-upload"
                        onChange={handleSketchUpload}
                      />
                      <div className="sketch-helper">Upload a clear photo or scanned sketch.</div>
                      {formValues.fireInstructionSketchImage && (
                        <div className="sketch-preview">
                          <img
                            src={formValues.fireInstructionSketchImage}
                            alt="Instruction sketch preview"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Details (Narrative)</h4>
                    <div className="form-field">
                      <textarea
                        rows={6}
                        value={formValues.fireDetailsNarrative}
                        onChange={handleChange('fireDetailsNarrative')}
                      />
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Problems Encountered</h4>
                    <div className="form-field">
                      <textarea
                        rows={4}
                        value={formValues.fireProblemsEncountered}
                        onChange={handleChange('fireProblemsEncountered')}
                      />
                    </div>
                  </div>

                  <div className="form-section">
                    <h4 className="section-title">Observations / Recommendations</h4>
                    <div className="form-field">
                      <textarea
                        rows={4}
                        value={formValues.fireObservations}
                        onChange={handleChange('fireObservations')}
                      />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="form-field">
                      <label htmlFor="fire-prepared">Prepared by</label>
                      <input
                        id="fire-prepared"
                        type="text"
                        value={formValues.firePreparedBy}
                        onChange={handleChange('firePreparedBy')}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="fire-noted">Noted by</label>
                      <input
                        id="fire-noted"
                        type="text"
                        value={formValues.fireNotedBy}
                        onChange={handleChange('fireNotedBy')}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeStepIndex === 3 && reportType === 'spotInvestigation' && (
                <div className="form-stack">
                  <div className="form-field">
                    <label htmlFor="sir-disposition">Disposition</label>
                    <textarea
                      id="sir-disposition"
                      rows={6}
                      value={formValues.sirDisposition}
                      onChange={handleChange('sirDisposition')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-noted">Noted By</label>
                    <input
                      id="sir-noted"
                      type="text"
                      placeholder="Name and signature of the Chief of the Intelligence and Investigation Unit"
                      value={formValues.sirNotedBy}
                      onChange={handleChange('sirNotedBy')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="sir-approved">Approved for Submission</label>
                    <input
                      id="sir-approved"
                      type="text"
                      placeholder="Name and signature of the Head of Office"
                      value={formValues.sirApprovedBy}
                      onChange={handleChange('sirApprovedBy')}
                    />
                  </div>
                </div>
              )}

              {activeStepIndex === 3 && reportType !== 'spotInvestigation' && reportType !== 'fireOperations' && (
                <div className="form-stack">
                  <div className="form-field">
                    <label htmlFor="findings">Findings</label>
                    <textarea
                      id="findings"
                      rows={6}
                      value={formValues.findings}
                      onChange={handleChange('findings')}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="recommendation">Recommendation</label>
                    <textarea
                      id="recommendation"
                      rows={6}
                      value={formValues.recommendation}
                      onChange={handleChange('recommendation')}
                    />
                  </div>
                </div>
              )}

              <div className="card-actions">
                <button
                  className="prev-step-btn"
                  onClick={handlePrevious}
                  disabled={activeStepIndex === 0 || isSavingDraft || isSubmitting}
                >
                  Previous
                </button>
                <button className="prev-step-btn" onClick={handleSaveDraft} disabled={isSavingDraft || isSubmitting}>
                  {isSavingDraft ? 'Saving Draft...' : 'Save Draft'}
                </button>
                <button className="next-step-btn" onClick={handleNext} disabled={isSavingDraft || isSubmitting}>
                  {activeStepIndex < stepTitles.length - 1 ? 'Next' : 'Finish'}
                </button>
              </div>

              {submitMessage.text && (
                <div
                  style={{
                    margin: '0.75rem 0 0',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '0.45rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: submitMessage.type === 'error' ? '#7f1d1d' : '#14532d',
                    background: submitMessage.type === 'error' ? '#fee2e2' : '#dcfce7',
                    border: `1px solid ${submitMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`
                  }}
                >
                  {submitMessage.text}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showPreview && (
        <div className="report-preview">
          <div className="report-preview-toolbar">
            <button className="preview-back-btn" onClick={handlePrevious}>
              Back to Edit
            </button>
            <div className="preview-actions">
              <button className="preview-print-btn" onClick={handlePrint}>
                Print
              </button>
              <button className="preview-print-btn" onClick={handleSaveDraft} disabled={isSavingDraft || isSubmitting}>
                {isSavingDraft ? 'Saving Draft...' : 'Save Draft'}
              </button>
              <button className="preview-submit-btn" onClick={handleSubmit} disabled={isSavingDraft || isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>

          {submitMessage.text && (
            <div
              style={{
                margin: '0.75rem 0 0',
                padding: '0.6rem 0.75rem',
                borderRadius: '0.45rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: submitMessage.type === 'error' ? '#7f1d1d' : '#14532d',
                background: submitMessage.type === 'error' ? '#fee2e2' : '#dcfce7',
                border: `1px solid ${submitMessage.type === 'error' ? '#fecaca' : '#bbf7d0'}`
              }}
            >
              {submitMessage.text}
            </div>
          )}

          <div className="report-preview-canvas">
            <div className="report-preview-page">
              {pdfUrl ? (
                <iframe
                  title="Investigation report preview"
                  src={pdfUrl}
                  className="report-preview-frame"
                />
              ) : (
                <div className="report-preview-placeholder">
                  Generating preview...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </section>
      </div>
    </div>
  );
}
