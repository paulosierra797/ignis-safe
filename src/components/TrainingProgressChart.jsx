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
import { shortenModuleLabels } from '../utils/chartLabelUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const data = {
  labels: [],
  datasets: [
    {
      label: 'Post-Test',
      data: [],
      backgroundColor: '#15803d',
      borderRadius: 4,
      barPercentage: 0.8
    },
    {
      label: 'Pre-Test',
      data: [],
      backgroundColor: '#2563eb',
      borderRadius: 4,
      barPercentage: 0.8
    }
  ]
};

export default function TrainingProgressChart({ chartData }) {
  const fullLabels = chartData?.labels?.length ? chartData.labels : data.labels;

  const liveData = {
    labels: shortenModuleLabels(fullLabels),
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items) => fullLabels[items[0]?.dataIndex] ?? ''
        }
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

  return <Bar data={liveData} options={options} />;
}
