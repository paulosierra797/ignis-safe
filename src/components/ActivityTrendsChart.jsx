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
      display: true,
      position: 'top',
      align: 'start',
      labels: {
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 8,
        boxHeight: 8,
        color: '#667085',
        font: { size: 11 }
      }
    },
    title: {
      display: false
    }
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        color: '#667085'
      },
      grid: {
        color: 'rgba(152, 162, 179, 0.18)'
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
      label: 'Activity 1',
      data: [],
      backgroundColor: '#2563eb',
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.9
    },
    {
      label: 'Activity 2',
      data: [],
      backgroundColor: '#f59e0b',
      borderRadius: 4,
      barPercentage: 0.8,
      categoryPercentage: 0.9
    }
  ]
};

export default function ActivityTrendsChart({ chartData }) {
  const liveData = {
    labels: chartData?.labels?.length ? chartData.labels : data.labels,
    datasets: [
      {
        ...data.datasets[0],
        label: 'Started Attempts',
        data: chartData?.started?.length ? chartData.started : data.datasets[0].data,
      },
      {
        ...data.datasets[1],
        label: 'Submitted Attempts',
        data: chartData?.submitted?.length ? chartData.submitted : data.datasets[1].data,
      },
    ],
  };

  return <Bar data={liveData} options={options} />;
}
