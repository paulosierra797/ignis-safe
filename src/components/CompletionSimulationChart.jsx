import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    title: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      max: 100,
      ticks: {
        stepSize: 20
      }
    },
    x: {
      grid: {
        display: false
      }
    }
  }
};

const data = {
  labels: ['Module 1', 'Module 2', 'Module 3'],
  datasets: [
    {
      label: 'Completion Rate',
      data: [68, 84, 76],
      backgroundColor: '#a78bfa',
      borderRadius: 4,
      barPercentage: 0.8
    },
    {
      label: 'Simulation Score',
      data: [72, 78, 81],
      backgroundColor: '#fbbf24',
      borderRadius: 4,
      barPercentage: 0.8
    }
  ]
};

export default function CompletionSimulationChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : data.labels,
    datasets: [
      {
        ...data.datasets[0],
        data: chartData?.completionRate?.length
          ? chartData.completionRate
          : data.datasets[0].data,
      },
      {
        ...data.datasets[1],
        label: 'Assessment Score',
        data: chartData?.assessmentScore?.length
          ? chartData.assessmentScore
          : data.datasets[1].data,
      },
    ],
  };

  return <Bar data={liveData} options={options} />;
}
