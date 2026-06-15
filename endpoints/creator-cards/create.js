const { createHandler } = require('@app-core/server');
const { createCreatorCard } = require('@app/services/creator-card-service');

function serializeCard(card) {
  if (!card) return null;
  return {
    id: card._id,
    title: card.title,
    description: card.description || null,
    slug: card.slug,
    creator_reference: card.creator_reference,
    links: card.links ? card.links.map((l) => ({ title: l.title, url: l.url })) : [],
    service_rates: card.service_rates
      ? {
          currency: card.service_rates.currency,
          rates: card.service_rates.rates
            ? card.service_rates.rates.map((r) => ({
                name: r.name,
                description: r.description || null,
                amount: r.amount,
              }))
            : [],
        }
      : null,
    status: card.status,
    access_type: card.access_type || 'public',
    access_code: card.access_code || null,
    created: card.created,
    updated: card.updated,
    deleted: card.deleted,
  };
}

module.exports = createHandler({
  path: '/creator-cards',
  method: 'post',
  middlewares: [],
  async handler(rc, helpers) {
    const payload = rc.body;
    const response = await createCreatorCard(payload);
    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: 'Creator Card Created Successfully.',
      data: serializeCard(response),
    };
  },
});
