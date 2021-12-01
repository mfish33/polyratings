import { BehaviorSubject } from "rxjs"
import { config } from "../App.config"
import { JwtAuthResponse } from "@polyratings/shared"
import { User } from "@polyratings/shared"
import jwt_decode from "jwt-decode";

const USER_LOCAL_STORAGE_KEY = 'user'

export class AuthService {

    private jwtToken:string | null = null
    public isAuthenticatedSubject = new BehaviorSubject<null | User>(null)

    constructor(
        private storage:Storage,
        private fetch: typeof window.fetch
    ) {
        const jwt = storage.getItem(USER_LOCAL_STORAGE_KEY) as string | null
        if(jwt) {
            this.setAuthState(jwt)
        }
    }

    public getJwt(): string | null {
        return this.jwtToken
    }

    public getUser(): User | null {
        return this.jwtToken ? jwt_decode(this.jwtToken) : null
    }

    public async login(calPolyUsername:string, password:string):Promise<User> {
        const loginRes = await this.fetch(
            `${config.remoteUrl}/auth/login`,
            {
                method:'POST', 
                headers:{
                    'Content-Type':'application/json'
                },
                body:JSON.stringify({email:`${calPolyUsername}@calpoly.edu`, password})
            }
        )
        if(loginRes.status != 200 && loginRes.status != 201) {
            const error = await loginRes.json()
            throw error.message
        }
        const loginBody = await loginRes.json() as JwtAuthResponse
        const jwt = loginBody.access_token
        
        // We know that this is a valid user since we just got a jwt
        return this.setAuthState(jwt) as User
    }

    public signOut() {
        this.setAuthState(null)
    }

    private setAuthState(jwtToken:string | null):User | null {
        this.jwtToken = jwtToken
        const user = this.getUser()
        this.isAuthenticatedSubject.next(user)
        if(jwtToken) {
            this.storage.setItem(USER_LOCAL_STORAGE_KEY, jwtToken)
        } else {
            this.storage.removeItem(USER_LOCAL_STORAGE_KEY)
        }
        return user
    }
}