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
import { wrapChartLabels } from '../utils/chartLabelUtils';

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
        stepSize: 20,
        callback: (value) => `${value}%`,
        color: '#667085'
      },
      grid: {
        color: 'rgba(152, 162, 179, 0.18)'
      }
    },
    x: {
      grid: {
        display: false
      },
      ticks: {
        autoSkip: false,
        maxRotation: 0,
        minRotation: 0,
      },
    }
  }
};

const data = {
  labels: [],
  datasets: [
    {
      label: 'Completion Rate',
      data: [],
      backgroundColor: '#0f766e',
      borderRadius: 4,
      barPercentage: 0.8
    },
    {
      label: 'Simulation Score',
      data: [],
      backgroundColor: '#f59e0b',
      borderRadius: 4,
      barPercentage: 0.8
    }
  ]
};

export default function CompletionSimulationChart({ chartData }) {
  const liveData = {
    labels: wrapChartLabels(chartData?.labels?.length ? chartData.labels : data.labels),
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
