import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persist, devtools } from 'zustand/middleware';

type OtpState = {
  modalStatus: boolean;
  phoneNumber: string;
  setModalStatus: (status: string) => void;
  setPhoneNumber: (phone: string) => void;
};

const useOtpStore = create<OtpState>()(
  devtools(
    persist(
      immer((set) => ({
        modalStatus: false,
        phoneNumber: '',
        setModalStatus: (status) =>
          set(
            (state) => {
              state.modalStatus = (status === 'open' && true) || (status === 'close' && false);
            },
            false,
            'opt/setModalStatus'
          ),
        setPhoneNumber: (phone) =>
          set(
            (state) => {
              state.phoneNumber = phone;
            },
            false,
            'opt/setPhoneNumber'
          ),
      })),
      { name: 'otp-storage' }
    ),
    { name: 'Opt Store' }
  )
);

export { useOtpStore };
