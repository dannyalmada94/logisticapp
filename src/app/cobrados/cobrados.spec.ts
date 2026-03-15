import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cobrados } from './cobrados';

describe('Cobrados', () => {
  let component: Cobrados;
  let fixture: ComponentFixture<Cobrados>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Cobrados]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Cobrados);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
