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
  labels: [],
  datasets: [
    {
      label: 'Completion Rate',
      data: [],
      backgroundColor: '#a78bfa',
      borderRadius: 4,
      barPercentage: 0.8
    },
    {
      label: 'Simulation Score',
      data: [],
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
        label: 'Simulation Completion',
        data: chartData?.simulationCompletion?.length
          ? chartData.simulationCompletion
          : data.datasets[1].data,
      },
    ],
  };

  return <Bar data={liveData} options={options} />;
}
