/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const createMockServer = require('@app-core/mock-server');
const { MockModelStubs } = require('@app/mock-models');

describe('Creator Card API Integration Tests', () => {
  let server;
  let creatorCardsDb = [];

  before(() => {
    // Override the mock model stubs for CreatorCard to act like a real in-memory DB
    MockModelStubs.CreatorCard.create.default = function (data) {
      const doc = {
        ...data,
      };
      creatorCardsDb.push(doc);
      return doc;
    };

    MockModelStubs.CreatorCard.findOne.default = function (configuration) {
      const { query } = configuration;
      const found = creatorCardsDb.find((card) =>
        Object.keys(query).every((key) => {
          if (query[key] === null) {
            return card[key] === null || card[key] === undefined;
          }
          return card[key] === query[key];
        })
      );
      return found ? { ...found } : null;
    };

    MockModelStubs.CreatorCard.updateOne.default = function (configuration) {
      const { query } = configuration;
      const { updateValues } = configuration;
      const idx = creatorCardsDb.findIndex((card) =>
        Object.keys(query).every((key) => card[key] === query[key])
      );
      if (idx !== -1) {
        Object.assign(creatorCardsDb[idx], updateValues);
        return { acknowledged: true, modifiedCount: 1 };
      }
      return { acknowledged: true, modifiedCount: 0 };
    };

    MockModelStubs.CreatorCard.deleteOne.default = function (configuration) {
      const { query } = configuration;
      const idx = creatorCardsDb.findIndex((card) =>
        Object.keys(query).every((key) => card[key] === query[key])
      );
      if (idx !== -1) {
        creatorCardsDb.splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    };

    // Initialize the server with the creator-cards endpoints
    server = createMockServer(['endpoints/creator-cards/']);
  });

  beforeEach(() => {
    // Clear the database between tests
    creatorCardsDb = [];
  });

  describe('POST /creator-cards (Create)', () => {
    it('should successfully create a public published creator card (Test Case 1)', async () => {
      const payload = {
        title: 'George Cooks',
        description: 'Weekly cooking podcast',
        slug: 'george-cooks',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        links: [{ title: 'YouTube', url: 'https://youtube.com/@georgecooks' }],
        service_rates: {
          currency: 'NGN',
          rates: [{ name: 'IG Story Post', description: 'One story mention', amount: 5000000 }],
        },
        status: 'published',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(200);
      expect(response.data.status).to.equal('success');
      expect(response.data.data.title).to.equal('George Cooks');
      expect(response.data.data.slug).to.equal('george-cooks');
      expect(response.data.data.id).to.not.be.undefined;
      expect(response.data.data._id).to.be.undefined;
      expect(response.data.data.access_type).to.equal('public');
      expect(response.data.data.access_code).to.be.null;
    });

    it('should auto-generate a slug if omitted (Test Case 2)', async () => {
      const payload = {
        title: 'Ada Designs Things',
        creator_reference: 'crt_a1b2c3d4e5f6g7h8',
        status: 'published',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(200);
      expect(response.data.data.slug).to.equal('ada-designs-things');
    });

    it('should successfully create a private card with an access code (Test Case 3)', async () => {
      const payload = {
        title: 'VIP Rate Card',
        creator_reference: 'crt_x9y8z7w6v5u4t3s2',
        status: 'published',
        access_type: 'private',
        access_code: 'A1B2C3',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(200);
      expect(response.data.data.access_code).to.equal('A1B2C3');
    });

    it('should return SL02 if slug is already taken (Test Case 7)', async () => {
      // First card
      creatorCardsDb.push({
        _id: '01JG8XYZA2B3C4D5E6F7G8H9J0',
        title: 'George Cooks',
        slug: 'george-cooks',
        creator_reference: 'crt_8f2k1m9x4p7w3q5z',
        status: 'published',
        access_type: 'public',
        deleted: null,
      });

      const payload = {
        title: 'Another George',
        slug: 'george-cooks',
        creator_reference: 'crt_m1n2b3v4c5x6z7l8',
        status: 'published',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(400);
      expect(response.data.status).to.equal('error');
      expect(response.data.code).to.equal('SL02');
    });

    it('should return AC01 if access_code is missing on a private card (Test Case 8)', async () => {
      const payload = {
        title: 'Secret Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'private',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(400);
      expect(response.data.code).to.equal('AC01');
    });

    it('should return AC05 if access_code is provided on a public card (Test Case 9)', async () => {
      const payload = {
        title: 'Public Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'published',
        access_type: 'public',
        access_code: 'A1B2C3',
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(400);
      expect(response.data.code).to.equal('AC05');
    });

    it('should return HTTP 400 on framework validation failure (Test Case 10)', async () => {
      const payload = {
        title: 'Bad Status Card',
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
        status: 'archived', // Invalid enum value
      };

      const response = await server.post('/creator-cards', { body: payload });
      expect(response.statusCode).to.equal(400);
      expect(response.data.status).to.equal('error');
    });
  });

  describe('GET /creator-cards/:slug (Retrieve)', () => {
    beforeEach(() => {
      // Set up some cards in the mocked database
      creatorCardsDb.push(
        {
          _id: '01JG8XYZA2B3C4D5E6F7G8H9J0',
          title: 'George Cooks',
          slug: 'george-cooks',
          creator_reference: 'crt_8f2k1m9x4p7w3q5z',
          links: [{ title: 'YouTube Channel', url: 'https://youtube.com/@georgecooks' }],
          service_rates: {
            currency: 'NGN',
            rates: [{ name: 'IG Story Post', amount: 5000000 }],
          },
          status: 'published',
          access_type: 'public',
          access_code: null,
          created: 1767052800000,
          updated: 1767052800000,
          deleted: null,
        },
        {
          _id: '02JG8XYZA2B3C4D5E6F7G8H9J0',
          title: 'VIP Rate Card',
          slug: 'vip-rate-card',
          creator_reference: 'crt_x9y8z7w6v5u4t3s2',
          status: 'published',
          access_type: 'private',
          access_code: 'A1B2C3',
          created: 1767052800000,
          updated: 1767052800000,
          deleted: null,
        },
        {
          _id: '03JG8XYZA2B3C4D5E6F7G8H9J0',
          title: 'Draft Card',
          slug: 'my-draft-card',
          creator_reference: 'crt_8f2k1m9x4p7w3q5z',
          status: 'draft',
          access_type: 'public',
          created: 1767052800000,
          updated: 1767052800000,
          deleted: null,
        }
      );
    });

    it('should retrieve a public published card (Test Case 4)', async () => {
      const response = await server.get('/creator-cards/george-cooks');
      expect(response.statusCode).to.equal(200);
      expect(response.data.data.title).to.equal('George Cooks');
      expect(response.data.data.id).to.equal('01JG8XYZA2B3C4D5E6F7G8H9J0');
      expect(response.data.data.access_code).to.be.undefined; // Should be omitted
    });

    it('should retrieve a private card with the correct access code (Test Case 5)', async () => {
      const response = await server.get('/creator-cards/vip-rate-card?access_code=A1B2C3');
      expect(response.statusCode).to.equal(200);
      expect(response.data.data.title).to.equal('VIP Rate Card');
      expect(response.data.data.access_code).to.be.undefined; // Should be omitted
    });

    it('should return NF01 for a non-existent card (Test Case 11)', async () => {
      const response = await server.get('/creator-cards/does-not-exist-123');
      expect(response.statusCode).to.equal(404);
      expect(response.data.code).to.equal('NF01');
    });

    it('should return NF02 for a draft card (Test Case 12)', async () => {
      const response = await server.get('/creator-cards/my-draft-card');
      expect(response.statusCode).to.equal(404);
      expect(response.data.code).to.equal('NF02');
    });

    it('should return AC03 for a private card requested without a pin (Test Case 13)', async () => {
      const response = await server.get('/creator-cards/vip-rate-card');
      expect(response.statusCode).to.equal(403);
      expect(response.data.code).to.equal('AC03');
    });

    it('should return AC04 for a private card requested with a wrong pin (Test Case 14)', async () => {
      const response = await server.get('/creator-cards/vip-rate-card?access_code=WRONG1');
      expect(response.statusCode).to.equal(403);
      expect(response.data.code).to.equal('AC04');
    });
  });

  describe('DELETE /creator-cards/:slug', () => {
    beforeEach(() => {
      creatorCardsDb.push({
        _id: '01JG8XYZA2B3C4D5E6F7G8H9J0',
        title: 'Ada Designs Things',
        slug: 'ada-designs-things',
        creator_reference: 'crt_a1b2c3d4e5f6g7h8',
        status: 'published',
        access_type: 'public',
        created: 1767052800000,
        updated: 1767052800000,
        deleted: null,
      });
    });

    it('should successfully delete a card and set deleted timestamp (Test Case 6)', async () => {
      const payload = {
        creator_reference: 'crt_a1b2c3d4e5f6g7h8',
      };

      const response = await server.delete('/creator-cards/ada-designs-things', { body: payload });
      expect(response.statusCode).to.equal(200);
      expect(response.data.data.deleted).to.not.be.null;

      // Verify that public retrieve now returns NF01 (Test Case 16)
      const getResponse = await server.get('/creator-cards/ada-designs-things');
      expect(getResponse.statusCode).to.equal(404);
      expect(getResponse.data.code).to.equal('NF01');
    });

    it('should return NF01 when deleting a non-existent card (Test Case 15)', async () => {
      const payload = {
        creator_reference: 'crt_q1w2e3r4t5y6u7i8',
      };

      const response = await server.delete('/creator-cards/does-not-exist-123', { body: payload });
      expect(response.statusCode).to.equal(404);
      expect(response.data.code).to.equal('NF01');
    });
  });
});
