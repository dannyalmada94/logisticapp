import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Viajes } from './viajes';

describe('Viajes', () => {
  let component: Viajes;
  let fixture: ComponentFixture<Viajes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Viajes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Viajes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
