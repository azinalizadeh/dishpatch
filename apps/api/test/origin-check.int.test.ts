import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { clock, createBoard, joinGuest, slotIds } from './helpers/boards.ts';
import { intApp, useTestDb } from './helpers/int-app.ts';
import { ORIGIN } from './helpers/requests.ts';

/** 07-security.md › T2: SameSite=Strict + Origin + JSON-only on every mutation. */
describe('origin check on claim', () => {
  const db = useTestDb();

  async function setup() {
    const board = await createBoard(db);
    const { app } = intApp(db, { clock });
    const [slot] = await slotIds(db, board.eventId);
    const sam = await joinGuest(db, board, 'Sam');
    const claim = () =>
      request(app)
        .post(`/api/events/${board.eventId}/slots/${slot?.id}/claim`)
        .set('Cookie', `dp_sess=${sam.cookie}`);
    return { claim };
  }

  it('rejects POST with foreign Origin with 403 BAD_ORIGIN', async () => {
    const { claim } = await setup();
    const foreign = await claim()
      .set('Origin', 'https://evil.example')
      .send({ dishName: 'Pie', dishTags: [] });
    const missing = await claim().send({ dishName: 'Pie', dishTags: [] });
    for (const res of [foreign, missing]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('BAD_ORIGIN');
    }
  });

  it('rejects form-encoded body with 415', async () => {
    const { claim } = await setup();
    const res = await claim().set('Origin', ORIGIN).type('form').send('dishName=Pie');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('accepts same-origin JSON', async () => {
    const { claim } = await setup();
    const res = await claim().set('Origin', ORIGIN).send({ dishName: 'Pie', dishTags: [] });
    expect(res.status).toBe(200);
  });
});
