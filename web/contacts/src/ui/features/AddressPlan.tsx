/**
 * An address's little plan (`contacts/services/plan`): a paper cut-out of a town around a pin, drawn
 * from the address alone, the same on every device; no map is fetched. The town is the well, its
 * streets the paper, the river and the park their washes, the pin a cut-out of the Rouge pigment.
 */
import { memo, useMemo } from 'react';

import { addressPlan, PLAN_HEIGHT, PLAN_PIN, PLAN_PIN_HOLE, PLAN_WIDTH } from '@unlease/contacts/services/plan';

import styles from '../contacts.module.css';

function AddressPlanComponent({ address, className }: { address: string; className?: string }) {
  const plan = useMemo(() => addressPlan(address), [address]);
  return (
    <svg className={className ? `${styles.planDrawing} ${className}` : styles.planDrawing} viewBox={`0 0 ${PLAN_WIDTH} ${PLAN_HEIGHT}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect className={styles.planGround} width={PLAN_WIDTH} height={PLAN_HEIGHT} />
      {plan.park ? <path className={styles.planPark} d={plan.park} /> : null}
      {plan.water ? <path className={styles.planWater} d={plan.water} strokeWidth={plan.waterWidth} /> : null}
      {plan.streets.map((street, index) => (
        <path key={index} className={styles.planStreet} d={street.d} strokeWidth={street.width} />
      ))}
      <path className={styles.planPin} d={PLAN_PIN} />
      <circle className={styles.planPinHole} cx={PLAN_PIN_HOLE.x} cy={PLAN_PIN_HOLE.y} r={PLAN_PIN_HOLE.r} />
    </svg>
  );
}

export const AddressPlan = memo(AddressPlanComponent);
