/* eslint-disable camelcase */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-lonely-if */
/* eslint-disable no-unused-vars */
const validator = require('@app-core/validator');
const creatorCardRepository = require('@app/repository/creator-card');
const { throwAppError } = require('@app-core/errors');
const { ulid } = require('ulid');

// Spec for creating creator card
const createSpec = validator.parse(`root {
  title string<trim|minLength:3|maxLength:100>
  description? string<trim|maxLength:500>
  slug? string<trim|minLength:5|maxLength:50>
  creator_reference string<trim|length:20>
  links[]? {
    title string<trim|minLength:1|maxLength:100>
    url string<trim|maxLength:200>
  }
  service_rates? {
    currency string(NGN|USD|GBP|GHS)
    rates[]? {
      name string<trim|minLength:3|maxLength:100>
      description? string<trim|maxLength:250>
      amount number
    }
  }
  status string(draft|published)
  access_type? string(public|private)
  access_code? string<trim|length:6>
}`);

// Spec for deleting creator card
const deleteSpec = validator.parse(`root {
  creator_reference string<trim|length:20>
}`);

/**
 * Generate a random 6-character alphanumeric suffix
 * @returns {string}
 */
function generateRandomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return suffix;
}

/**
 * Create a new Creator Card
 * @param {object} serviceData
 * @returns {Promise<object>}
 */
async function createCreatorCard(serviceData) {
  // Validate incoming data with VSL
  const validatedData = validator.validate(serviceData, createSpec);

  // 1. Business validations for links URLs
  if (validatedData.links) {
    validatedData.links.forEach((link, idx) => {
      if (!link.url.startsWith('http://') && !link.url.startsWith('https://')) {
        throwAppError(
          `Link at index ${idx} url must start with http:// or https://`,
          'SPCL_VALIDATION',
          {
            details: [
              {
                field: `links.${idx}.url`,
                message: 'Link URL must start with http:// or https://',
              },
            ],
          }
        );
      }
    });
  }

  // 2. Business validations for service rates
  if (validatedData.service_rates) {
    const { currency, rates } = validatedData.service_rates;
    if (!rates || !Array.isArray(rates) || rates.length === 0) {
      throwAppError(
        'rates must be a non-empty array when service_rates is present',
        'SPCL_VALIDATION',
        {
          details: [
            {
              field: 'service_rates.rates',
              message: 'Rates array must not be empty',
            },
          ],
        }
      );
    }
    rates.forEach((rate, idx) => {
      if (!Number.isInteger(rate.amount) || rate.amount <= 0) {
        throwAppError(`Rate amount at index ${idx} must be a positive integer`, 'SPCL_VALIDATION', {
          details: [
            {
              field: `service_rates.rates.${idx}.amount`,
              message: 'Amount must be a positive integer (minor units)',
            },
          ],
        });
      }
    });
  }

  // 3. Business validations for access_type and access_code
  const accessType = validatedData.access_type || 'public';
  const accessCode = validatedData.access_code;

  if (accessType === 'private') {
    if (!accessCode) {
      throwAppError('access_code is required when access_type is private', 'AC01');
    }
    // Verify access_code format (exactly 6 alphanumeric characters)
    if (!/^[a-zA-Z0-9]{6}$/.test(accessCode)) {
      throwAppError('access_code must be exactly 6 alphanumeric characters', 'SPCL_VALIDATION', {
        details: [
          {
            field: 'access_code',
            message: 'Access code must be exactly 6 alphanumeric characters',
          },
        ],
      });
    }
  } else {
    // public or omitted
    if (accessCode !== undefined && accessCode !== null && accessCode !== '') {
      throwAppError('access_code can only be set on private cards', 'AC05');
    }
  }

  // 4. Slug uniqueness and generation
  let { slug } = validatedData;
  if (slug) {
    // Validate custom regex for slug format
    if (!/^[a-zA-Z0-9-_]+$/.test(slug)) {
      throwAppError(
        'Slug can only contain letters, numbers, hyphens, and underscores',
        'SPCL_VALIDATION',
        {
          details: [
            {
              field: 'slug',
              message: 'Slug can only contain letters, numbers, hyphens, and underscores',
            },
          ],
        }
      );
    }

    // Check uniqueness
    const existingCard = await creatorCardRepository.findOne({ query: { slug, deleted: null } });
    if (existingCard) {
      throwAppError('Slug is already taken', 'SL02');
    }
  } else {
    // Auto-generate slug from title
    const baseSlug = validatedData.title
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '');

    let generatedSlug = baseSlug;
    let isTaken = false;

    if (generatedSlug.length >= 5) {
      const existing = await creatorCardRepository.findOne({
        query: { slug: generatedSlug, deleted: null },
      });
      if (existing) {
        isTaken = true;
      }
    }

    if (generatedSlug.length < 5 || isTaken) {
      let uniqueFound = false;
      while (!uniqueFound) {
        const suffix = generateRandomSuffix();
        const testSlug = generatedSlug ? `${generatedSlug}-${suffix}` : suffix;
        const existing = await creatorCardRepository.findOne({
          query: { slug: testSlug, deleted: null },
        });
        if (!existing) {
          generatedSlug = testSlug;
          uniqueFound = true;
        }
      }
    }
    slug = generatedSlug;
  }

  // Save to DB
  const now = Date.now();
  const cardData = {
    _id: ulid(),
    title: validatedData.title,
    description: validatedData.description || null,
    slug,
    creator_reference: validatedData.creator_reference,
    links: validatedData.links || [],
    service_rates: validatedData.service_rates || null,
    status: validatedData.status,
    access_type: accessType,
    access_code: accessCode || null,
    created: now,
    updated: now,
    deleted: null,
  };

  const newCard = await creatorCardRepository.create(cardData);
  return newCard;
}

/**
 * Retrieve a Creator Card by slug with public access rules
 * @param {string} slug
 * @param {string} [accessCode]
 * @returns {Promise<object>}
 */
async function getCreatorCardBySlug(slug, accessCode) {
  // 1. Check if card exists
  const card = await creatorCardRepository.findOne({ query: { slug, deleted: null } });
  if (!card) {
    throwAppError('Creator card not found', 'NF01');
  }

  // 2. Check if status is draft
  if (card.status === 'draft') {
    throwAppError('Creator card not found', 'NF02');
  }

  // 3 & 4. Access code checks for private cards
  if (card.access_type === 'private') {
    if (!accessCode) {
      throwAppError('This card is private. An access code is required', 'AC03');
    }
    if (card.access_code !== accessCode) {
      throwAppError('Invalid access code', 'AC04');
    }
  }

  return card;
}

/**
 * Delete a Creator Card by slug
 * @param {string} slug
 * @param {object} serviceData
 * @returns {Promise<object>}
 */
async function deleteCreatorCard(slug, serviceData) {
  // Validate creator reference
  const validatedData = validator.validate(serviceData, deleteSpec);
  const { creator_reference } = validatedData;

  const card = await creatorCardRepository.findOne({ query: { slug, deleted: null } });
  if (!card) {
    throwAppError('Creator card not found', 'NF01');
  }

  if (card.creator_reference !== creator_reference) {
    throwAppError('Creator reference mismatch', 'INVALID_REQUEST');
  }

  const now = Date.now();
  await creatorCardRepository.updateOne({
    query: { _id: card._id },
    updateValues: { deleted: now },
  });

  card.deleted = now;
  card.updated = now;

  return card;
}

module.exports = {
  createCreatorCard,
  getCreatorCardBySlug,
  deleteCreatorCard,
};
