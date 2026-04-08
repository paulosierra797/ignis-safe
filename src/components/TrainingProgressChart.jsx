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
      label: 'Post-Test',
      data: [],
      backgroundColor: '#f99ca2',
      borderRadius: 4,
      barPercentage: 0.8
    },
    {
      label: 'Pre-Test',
      data: [],
      backgroundColor: '#5dc5d8',
      borderRadius: 4,
      barPercentage: 0.8
    }
  ]
};

export default function TrainingProgressChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : data.labels,
    datasets: [
      {
        ...data.datasets[0],
        data: chartData?.postTest?.length ? chartData.postTest : data.datasets[0].data,
      },
      {
        ...data.datasets[1],
        data: chartData?.preTest?.length ? chartData.preTest : data.datasets[1].data,
      },
    ],
  };

  return <Bar data={liveData} options={options} />;
}
