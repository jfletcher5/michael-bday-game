/**
 * Unit tests for ball gifting pricing (MIE-35).
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_TYPES,
  getBallGiftGemPrice,
  isBallGiftable,
} from './ballTypes';
import { AURORA_BALL_ID } from './aurora';
import { VIP_BALL_ID } from './gamepasses';

describe('ball gifting (MIE-35)', () => {
  it('blocks gifting Classic Red, Aurora, and VIP balls', () => {
    const blocked = BALL_TYPES.filter((b) =>
      ['default', AURORA_BALL_ID, VIP_BALL_ID].includes(b.id),
    );
    for (const ball of blocked) {
      assert.equal(isBallGiftable(ball), false);
      assert.equal(getBallGiftGemPrice(ball), null);
    }
  });

  it('keeps Poop Ball gift cost at 200,000 gems', () => {
    const poop = BALL_TYPES.find((b) => b.id === 'poop');
    assert.ok(poop);
    assert.equal(getBallGiftGemPrice(poop), 200_000);
    assert.equal(isBallGiftable(poop), true);
  });

  it('charges half coin price in gems for other eligible shop balls', () => {
    const marshmallow = BALL_TYPES.find((b) => b.id === 'marshmallow');
    const soccer = BALL_TYPES.find((b) => b.id === 'soccer-ball');
    assert.ok(marshmallow);
    assert.ok(soccer);
    assert.equal(getBallGiftGemPrice(marshmallow), 500_000);
    assert.equal(getBallGiftGemPrice(soccer), 3_750);
    assert.equal(isBallGiftable(marshmallow), true);
    assert.equal(isBallGiftable(soccer), true);
  });

  it('giftable coin balls include those without ball.gemPrice set', () => {
    const angel = BALL_TYPES.find((b) => b.id === 'angel');
    assert.ok(angel);
    assert.equal(angel.gemPrice, undefined);
    assert.equal(getBallGiftGemPrice(angel), 500);
    assert.equal(isBallGiftable(angel), true);
  });
});
