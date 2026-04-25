import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { TimeOffRequestStatus } from './time-off-request-status.enum';

@Entity({ name: 'time_off_requests' })
@Index('IDX_time_off_requests_idempotency_key', ['idempotencyKey'], {
  unique: true
})
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  employeeId: string;

  @Column({ type: 'varchar', length: 128 })
  locationId: string;

  @Column({ type: 'float' })
  daysRequested: number;

  @Column({
    type: 'simple-enum',
    enum: TimeOffRequestStatus,
    default: TimeOffRequestStatus.PENDING
  })
  status: TimeOffRequestStatus;

  @Column({ type: 'varchar', length: 256, nullable: true })
  externalRefId: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
