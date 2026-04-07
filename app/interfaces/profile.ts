export default interface Profile {
  id: string;
  username: string;
  email: string;
  password: string;
  isSubscribed?: boolean;
  phone?: string;
}