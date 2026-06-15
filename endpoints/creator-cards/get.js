/* eslint-disable camelcase */
const { createHandler } = require('@app-core/server');
const { getCreatorCardBySlug } = require('@app/services/creator-card-service');

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
    created: card.created,
    updated: card.updated,
    deleted: card.deleted,
  };
}

module.exports = createHandler({
  path: '/creator-cards/:slug',
  method: 'get',
  middlewares: [],
  async handler(rc, helpers) {
    const { slug } = rc.params;
    const { access_code } = rc.query;
    const response = await getCreatorCardBySlug(slug, access_code);
    return {
      status: helpers.http_statuses.HTTP_200_OK,
      message: 'Creator Card Retrieved Successfully.',
      data: serializeCard(response),
    };
  },
});
