import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Modificar } from './modificar';

describe('Modificar', () => {
  let component: Modificar;
  let fixture: ComponentFixture<Modificar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Modificar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Modificar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
