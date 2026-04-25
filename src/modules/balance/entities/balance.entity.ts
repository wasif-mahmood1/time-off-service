import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  VersionColumn
} from 'typeorm';

@Entity({ name: 'balances' })
@Index('IDX_balances_employee_location', ['employeeId', 'locationId'], {
  unique: true
})
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  employeeId: string;

  @Column({ type: 'varchar', length: 128 })
  locationId: string;

  @Column({ type: 'float' })
  balance: number;

  @VersionColumn()
  version: number;

  @Column({ type: 'datetime' })
  updatedAt: Date;
}
