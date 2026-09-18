(function (NS) {
  'use strict';

  NS.Cases = [
    {
      id: 'gammSub',
      label: 'GAMM kanál — subsonický (M=0.5)',
      hint: 'Hladké proudění bez šoku. Spodní stěna: kruhový oblouk x ∈ [1, 2], h = 0.1.',
      params: {
        inletMach: 0.5,
        inletMode: 'subsonic',
        outletMode: 'subsonic',
        outletPback: 0.843,
        cfl: 0.8,
        rkOrder: 3,
        fluxScheme: 'roe',
        ni: 240, nj: 60,
      },
    },
    {
      id: 'gammTrans',
      label: 'GAMM kanál — transonický (M=0.85)',
      hint: 'Referenční úloha GAMM. Na spodní stěně prostředního segmentu vznikne šok.',
      params: {
        inletMach: 0.85,
        inletMode: 'subsonic',
        outletMode: 'subsonic',
        outletPback: 0.7386,
        cfl: 0.7,
        rkOrder: 3,
        fluxScheme: 'roe',
        ni: 240, nj: 60,
      },
    },
    {
      id: 'gammSuper',
      label: 'GAMM kanál — supersonický (M=1.2)',
      hint: 'Supersonický vstup. Všechny veličiny předepsány na vstupu; výstup extrapoluován.',
      params: {
        inletMach: 1.2,
        inletMode: 'supersonic',
        outletMode: 'supersonic',
        outletPback: 0.5,
        cfl: 0.6,
        rkOrder: 3,
        fluxScheme: 'roe',
        ni: 240, nj: 60,
      },
    },
    {
      id: 'flatSub',
      label: 'Rovný kanál — subsonický (M=0.5)',
      hint: 'Rovnoběžné stěny přes celý kanál [0, 3]. Analytické řešení: uniformní proudění.',
      params: {
        inletMach: 0.5,
        inletMode: 'subsonic',
        outletMode: 'subsonic',
        outletPback: 0.843,
        cfl: 0.9,
        rkOrder: 3,
        fluxScheme: 'roe',
        ni: 180, nj: 40,
        flatGeometry: true,
      },
    },
  ];
})(window.FVM);
