import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Transportistas } from './transportistas';

describe('Transportistas', () => {
  let component: Transportistas;
  let fixture: ComponentFixture<Transportistas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Transportistas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Transportistas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
