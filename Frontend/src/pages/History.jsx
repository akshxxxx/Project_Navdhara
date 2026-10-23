import React from 'react';

const historyData = [
  { id: 'seg_04', name: 'Kaudiyala to Devprayag', events: 96, perKm: 2.95 },
  { id: 'seg_05', name: 'Devprayag to Teen Dhara', events: 44, perKm: 2.95 },
  { id: 'seg_03', name: 'Byasi to Kaudiyala', events: 36, perKm: 2.60 },
  { id: 'seg_17', name: 'Pipalkoti to Helang', events: 32, perKm: 1.12 },
  { id: 'seg_01', name: 'Rishikesh to Shivpuri', events: 23, perKm: 1.32 },
  { id: 'seg_02', name: 'Shivpuri to Byasi', events: 20, perKm: 2.93 },
  { id: 'seg_09', name: 'Sirobagarh to Rudraprayag', events: 17, perKm: 0.72 },
  { id: 'seg_14', name: 'Nandprayag to Chamoli', events: 9, perKm: 0.69 },
  { id: 'seg_06', name: 'Teen Dhara to Kirtinagar', events: 7, perKm: 0.56 },
  { id: 'seg_07', name: 'Kirtinagar to Srinagar', events: 4, perKm: 0.81 },
  { id: 'seg_10', name: 'Rudraprayag to Gauchar', events: 4, perKm: 0.18 },
  { id: 'seg_12', name: 'Karnaprayag to Langasu', events: 4, perKm: 0.66 },
  { id: 'seg_16', name: 'Birahi to Pipalkoti', events: 4, perKm: 0.59 },
  { id: 'seg_11', name: 'Gauchar to Karnaprayag', events: 3, perKm: 0.31 },
  { id: 'seg_18', name: 'Helang to Joshimath', events: 3, perKm: 0.47 },
  { id: 'seg_13', name: 'Langasu to Nandprayag', events: 2, perKm: 0.15 },
  { id: 'seg_08', name: 'Srinagar to Sirobagarh', events: 1, perKm: 0.11 },
  { id: 'seg_15', name: 'Chamoli to Birahi', events: 0, perKm: 0.00 }
];

export const History = () => {
  const maxEvents = Math.max(...historyData.map(d => d.events));

  return (
    <div className="flex-1 w-full max-w-[720px] mx-auto p-4 lg:p-8 pb-16">
      <div className="mb-8">
        <h1 className="font-condensed text-[28px] leading-[34px] font-semibold text-ink">Past landslide events on NH-7</h1>
        <p className="text-granite text-sm mt-2">
          Mapped after the 2022 monsoon (309 road-blocking landslides). One season only.
        </p>
      </div>

      <div className="bg-snow border border-mist rounded-md p-4 lg:p-6 shadow-sm">
        <h2 className="font-condensed text-[18px] font-semibold mb-6 text-ink">Landslides per stretch</h2>
        
        <div className="space-y-4">
          {historyData.map(stretch => {
            const percentage = maxEvents > 0 ? (stretch.events / maxEvents) * 100 : 0;
            return (
              <div key={stretch.id} className="group">
                <div className="flex justify-between items-end mb-1">
                  <span className="font-sans text-sm font-medium text-ink">{stretch.name}</span>
                  <span className="font-condensed text-sm font-semibold text-granite tabular-nums">
                    {stretch.events} <span className="font-normal text-xs text-mist ml-1">({stretch.perKm.toFixed(2)}/km)</span>
                  </span>
                </div>
                <div className="h-3 w-full bg-glacier rounded-sm overflow-hidden">
                  <div 
                    className="h-full bg-granite group-hover:bg-river transition-all duration-300 ease-out" 
                    style={{ width: `${percentage}%` }} 
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <p className="mt-6 text-sm text-granite font-sans">
        <strong>Note:</strong> Do not draw conclusions from this table about Sirobagarh: the survey saw only 1 slide there in 2022, yet the highway is known for debris. Closures and driver reports cover that gap.
      </p>
    </div>
  );
};
