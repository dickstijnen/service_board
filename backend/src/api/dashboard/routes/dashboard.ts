export default {
  routes: [
    {
      method: 'GET',
      path: '/dashboard/stats',
      handler: 'dashboard.stats',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'GET',
      path: '/dashboard/containers-kaart',
      handler: 'dashboard.containersKaart',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST',
      path: '/dashboard/chauffeur',
      handler: 'dashboard.chauffeurAanmaken',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'PUT',
      path: '/dashboard/chauffeur/:id',
      handler: 'dashboard.chauffeurBijwerken',
      config: { policies: [], middlewares: [] },
    },
  ],
}
