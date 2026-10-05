import { useForm, Head } from '@inertiajs/react';

export default function Login() {
    const { data, setData, post, processing, errors, reset } = useForm({
        username: '',
        password: '',
    });

    function submit(e) {
        e.preventDefault();
        post('/login', {
            onFinish: () => reset('password'),
        });
    }

    return (
        /* Added 'relative' and background image layers here */
        <div className="relative min-h-screen w-full flex items-center justify-center bg-gray-100 px-4 py-10 isolat">
            {/* Background Image Layer with Opacity */}
            <div 
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
                style={{ backgroundImage: "url('/images/carnation.jpg')", opacity: 0.6 }}
            />
            
            <Head title="Log in" />
            <div className="w-full max-w-md z-10">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img 
                        src="/images/logo.jpg" 
                        alt="Mimochi Logo" 
                        className="w-[5rem] h-[5rem] -my-2 object-contain shrink-0" style={{ borderRadius: '40px' }}
                    />
                </div>

                {/* Card */}
                <div className="w-full bg-white rounded-lg shadow-md px-6 py-8 sm:px-10 sm:py-10" style={{ borderRadius: '30px' }}>
                    <form onSubmit={submit} noValidate>
                        {/* Email */}
                        <div className="mb-5">
                            <label htmlFor="username" className="block text-sm text-gray-700 mb-2">
                                Username :
                            </label>
                            <input 
                                id="username" 
                                type="text" 
                                autoFocus 
                                autoComplete="username" 
                                value={data.username} 
                                onChange={(e) => setData('username', e.target.value)} 
                                className="w-full rounded-md border border-gray-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)] transition" 
                            />
                            {errors.username && (
                                <div className="mt-2 text-sm text-red-600" role="alert">
                                    {errors.username}
                                </div>
                            )}
                        </div>

                        {/* Password */}
                        <div className="mb-6">
                            <label htmlFor="password" className="block text-sm text-gray-700 mb-2">
                                Password :
                            </label>
                            <input 
                                id="password" 
                                type="password" 
                                autoComplete="current-password" 
                                value={data.password} 
                                onChange={(e) => setData('password', e.target.value)} 
                                className="w-full rounded-md border border-gray-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[rgb(240,136,176)] focus:border-[rgb(240,136,176)] transition" 
                            />
                            {errors.password && (
                                <p className="mt-2 text-sm text-red-600">{errors.password}</p>
                            )}
                        </div>

                        {/* Submit */}
                        <div className="flex justify-end">
                            <button 
                                type="submit" 
                                disabled={processing} 
                                className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold tracking-wide uppercase px-6 py-2.5 rounded-md transition disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: 'rgb(240 136 176)' }}
                            >
                                Log in
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
